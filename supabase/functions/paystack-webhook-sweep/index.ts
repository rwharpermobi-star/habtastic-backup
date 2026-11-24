import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_ATTEMPTS = 6;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retention-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sharedSecret = Deno.env.get("RETENTION_JOB_SECRET") ?? "";
  if (!url || !anon || !serviceKey) return json({ error: "server_unavailable" }, 503);

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const headerSecret = req.headers.get("x-retention-secret") ?? "";
  const admin = createClient(url, serviceKey);

  let authorized = bearer === serviceKey || (!!sharedSecret && headerSecret === sharedSecret);
  if (!authorized && bearer) {
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: auth } = await userClient.auth.getUser();
    if (auth?.user) {
      const { data: role } = await admin.from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      authorized = !!role;
    }
  }
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 25, 1), 100);
  const now = new Date().toISOString();
  const { data: due, error: dueError } = await admin.from("paystack_webhook_events")
    .select("id,event_type,raw_payload,attempts,user_id")
    .in("status", ["failed", "received"])
    .lt("attempts", MAX_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("received_at", { ascending: true })
    .limit(limit);
  if (dueError) return json({ error: "queue_unavailable" }, 500);

  const outcomes: any[] = [];
  for (const ev of due ?? []) {
    const attempts = Number(ev.attempts ?? 0) + 1;
    const { data: claimed } = await admin.from("paystack_webhook_events")
      .update({ attempts, last_attempt_at: new Date().toISOString(), next_retry_at: new Date(Date.now() + 60_000).toISOString() })
      .eq("id", ev.id)
      .eq("attempts", ev.attempts ?? 0)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const raw = ev.raw_payload as any;
    const eventType = raw?.event ?? ev.event_type;
    const data = raw?.data ?? {};
    try {
      const response = await fetch(`${url}/functions/v1/paystack-process-event`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventType, data, eventId: raw?.id ?? null }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status >= 500) throw new Error(`processor_${response.status}`);

      await admin.from("paystack_webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        next_retry_at: null,
        error_message: response.ok ? null : String(result?.reason ?? result?.error ?? "rejected").slice(0, 500),
        user_id: result?.userId ?? data?.metadata?.user_id ?? ev.user_id ?? null,
      }).eq("id", ev.id);
      outcomes.push({ event_id: ev.id, event_type: eventType, attempts, ok: true, processed: result?.processed ?? false });
    } catch (error) {
      const delayMinutes = [1, 5, 15, 60, 360, 1440][Math.min(attempts - 1, 5)];
      const exhausted = attempts >= MAX_ATTEMPTS;
      await admin.from("paystack_webhook_events").update({
        status: "failed",
        last_attempt_at: new Date().toISOString(),
        next_retry_at: exhausted ? null : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        error_message: String(error).slice(0, 1000),
      }).eq("id", ev.id);
      outcomes.push({ event_id: ev.id, event_type: eventType, attempts, ok: false, exhausted, error: "retry_failed" });
    }
  }

  return json({
    ok: true,
    processed: outcomes.length,
    recovered: outcomes.filter((o) => o.ok).length,
    stillFailing: outcomes.filter((o) => !o.ok).length,
    outcomes,
  });
});
