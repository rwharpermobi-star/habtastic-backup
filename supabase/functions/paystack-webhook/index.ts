import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function verificationKeys(): { key: string; label: "current" | "previous" }[] {
  const current = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!current) return [];
  const keys: { key: string; label: "current" | "previous" }[] = [{ key: current, label: "current" }];
  const previous = Deno.env.get("PAYSTACK_SECRET_KEY_PREVIOUS");
  if (previous && previous !== current) keys.push({ key: previous, label: "previous" });
  return keys;
}

function verify(raw: string, signature: string | null): "current" | "previous" | null {
  if (!signature) return null;
  const provided = new TextEncoder().encode(signature.toLowerCase());
  for (const { key, label } of verificationKeys()) {
    const expected = createHmac("sha512", key).update(raw).digest("hex");
    if (signature.length !== expected.length) continue;
    try {
      if (timingSafeEqual(provided, new TextEncoder().encode(expected))) return label;
    } catch { /* ignore: best effort */ }
  }
  return null;
}

function eventHash(event: any, signature: string, raw: string): string {
  const eventType = event?.event ?? "unknown";
  const id = event?.id ?? event?.data?.id;
  const ref = event?.data?.reference ?? event?.data?.subscription_code ?? event?.data?.subscription?.subscription_code;
  return createHash("sha256").update(id ? `${eventType}:${id}:${signature}` : ref ? `${eventType}:${ref}:${signature}` : `${signature}:${raw}`).digest("hex");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  const keyUsed = verify(raw, signature);
  if (!keyUsed) return new Response("Invalid signature", { status: 401 });

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return new Response("Server unavailable", { status: 503 });
  const admin = createClient(supabaseUrl, serviceKey);

  const hash = eventHash(event, signature ?? "", raw);
  const eventType = event?.event ?? "unknown";
  const data = event?.data ?? {};
  const summary = {
    reference: data?.reference ?? null,
    subscription_code: data?.subscription_code ?? data?.subscription?.subscription_code ?? null,
    customer_code: data?.customer?.customer_code ?? null,
    amount: data?.amount ?? null,
    currency: data?.currency ?? data?.plan?.currency ?? null,
    status: data?.status ?? null,
    payment_kind: data?.metadata?.kind ?? null,
    paystack_event_id: event?.id ?? null,
    signing_key: keyUsed,
  };

  let eventRow: any = null;
  const { data: inserted, error: insertError } = await admin.from("paystack_webhook_events").insert({
    event_hash: hash,
    idempotency_key: hash,
    event_type: eventType,
    source: "webhook",
    status: "received",
    paystack_reference: summary.reference,
    paystack_subscription_code: summary.subscription_code,
    payload_summary: summary,
    raw_payload: event,
    attempts: 0,
  }).select("id,status,attempts,duplicate_count,next_retry_at").maybeSingle();

  if (insertError) {
    if ((insertError as any).code !== "23505") {
      console.error("paystack-webhook storage error", insertError);
      return new Response("Storage error", { status: 500 });
    }
    const { data: existing, error: existingError } = await admin.from("paystack_webhook_events")
      .select("id,status,attempts,duplicate_count,next_retry_at")
      .eq("event_hash", hash)
      .maybeSingle();
    if (existingError || !existing) return new Response("Storage error", { status: 500 });
    eventRow = existing;
    await admin.from("paystack_webhook_events").update({
      duplicate_count: (existing.duplicate_count ?? 0) + 1,
    }).eq("id", existing.id);
    if (existing.status === "processed") return json({ received: true, duplicate: true });
    if (existing.status === "failed" && !existing.next_retry_at) {
      return json({ received: true, duplicate: true, rejected: true });
    }
  } else {
    eventRow = inserted;
  }

  const attempt = Number(eventRow?.attempts ?? 0) + 1;
  try {
    const processResponse = await fetch(`${supabaseUrl}/functions/v1/paystack-process-event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventType, data, eventId: event?.id ?? null }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await processResponse.json().catch(() => ({}));

    if (!processResponse.ok && processResponse.status >= 500) {
      throw new Error(`processor_${processResponse.status}`);
    }

    // A non-5xx processor rejection is permanent for this delivery: record it as
    // failed with no retry scheduled, rather than making it look processed.
    if (!processResponse.ok) {
      const reason = String(result?.reason ?? result?.error ?? `processor_${processResponse.status}_rejected`).slice(0, 1000);
      const { error: updateError } = await admin.from("paystack_webhook_events").update({
        status: "failed",
        attempts: attempt,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: null,
        error_message: reason,
        user_id: result?.userId ?? data?.metadata?.user_id ?? null,
      }).eq("id", eventRow.id);
      if (updateError) throw new Error("could_not_record_processor_rejection");
      return json({ received: true, processed: false, rejected: true });
    }

    let shopOrderId: string | null = null;
    let subscriptionId: string | null = null;
    if (summary.reference) {
      const { data: order } = await admin.from("shop_orders").select("id").eq("paystack_reference", summary.reference).maybeSingle();
      shopOrderId = order?.id ?? null;
    }
    if (summary.subscription_code) {
      const { data: sub } = await admin.from("subscriptions").select("id").eq("paystack_subscription_code", summary.subscription_code).maybeSingle();
      subscriptionId = sub?.id ?? null;
    }

    await admin.from("paystack_webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: null,
      error_message: processResponse.ok ? null : String(result?.reason ?? result?.error ?? "rejected").slice(0, 500),
      user_id: result?.userId ?? data?.metadata?.user_id ?? null,
      shop_order_id: shopOrderId,
      subscription_id: subscriptionId,
    }).eq("id", eventRow.id);

    return json({ received: true, processed: result?.processed ?? false });
  } catch (error) {
    const retryAt = new Date(Date.now() + Math.min(60, Math.max(1, 5 ** Math.min(attempt - 1, 3))) * 60_000).toISOString();
    await admin.from("paystack_webhook_events").update({
      status: "failed",
      attempts: attempt,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: retryAt,
      error_message: String(error).slice(0, 1000),
    }).eq("id", eventRow.id);
    console.error("paystack-webhook processing failed", error);
    return new Response("Webhook error", { status: 500 });
  }
});
