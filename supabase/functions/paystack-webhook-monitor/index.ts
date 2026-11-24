import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retention-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const DEDUPE_HOURS = 6;
const NO_EVENTS_DAYS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sharedSecret = Deno.env.get("RETENTION_JOB_SECRET") ?? "";
  const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";
  if (!url || !serviceKey) return json({ error: "server_unavailable" }, 503);

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const headerSecret = req.headers.get("x-retention-secret") ?? "";
  if (bearer !== serviceKey && !(sharedSecret && headerSecret === sharedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(url, serviceKey);
  const environment = paystackKey.startsWith("sk_live_") ? "live" : "test";

  // Drain retries only through the hardened sweep endpoint. This monitor never
  // imports or executes payment mutation code directly.
  let retrySweep: any = { processed: 0, recovered: 0, outcomes: [] };
  try {
    const sweepResponse = await fetch(`${url}/functions/v1/paystack-webhook-sweep`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 50 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (sweepResponse.ok) retrySweep = await sweepResponse.json().catch(() => retrySweep);
    else console.error("[paystack-webhook-monitor] retry sweep failed", sweepResponse.status);
  } catch (error) {
    console.error("[paystack-webhook-monitor] retry sweep exception", error);
  }

  if (environment !== "live") {
    return json({ ok: true, skipped: "not_live", environment, retrySweep });
  }

  const webhookUrl = Deno.env.get("PAYSTACK_WEBHOOK_URL") || `${url}/functions/v1/paystack-webhook`;
  let reachOk = false;
  let reachDetail = "";
  try {
    const probe = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-paystack-signature": "invalid-health-probe" },
      body: JSON.stringify({ event: "healthcheck.ping", data: {} }),
      signal: AbortSignal.timeout(8_000),
    });
    // 401 is the expected healthy response because the signature is invalid.
    reachOk = probe.status === 401 || (probe.status > 0 && probe.status < 500);
    reachDetail = `HTTP ${probe.status}`;
  } catch (error) {
    console.error("[paystack-webhook-monitor] webhook probe failed", error);
    reachDetail = "network_error";
  }

  const { data: latest } = await admin.from("paystack_webhook_events")
    .select("received_at")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const now = Date.now();
  const lastEventMs = latest?.received_at ? new Date(latest.received_at).getTime() : null;
  const minutesSinceLast = lastEventMs ? Math.floor((now - lastEventMs) / 60_000) : null;
  const stale = lastEventMs === null || now - lastEventMs > NO_EVENTS_DAYS * 86_400_000;

  const alerts: Array<{ type: string; severity: string; description: string }> = [];
  if (!reachOk) alerts.push({
    type: "paystack_webhook_unreachable",
    severity: "high",
    description: `Paystack webhook unreachable in LIVE (${reachDetail})`,
  });
  if (stale) alerts.push({
    type: "paystack_webhook_no_events_3d",
    severity: "high",
    description: lastEventMs === null ? "No Paystack webhook events on record (LIVE)" : `No Paystack webhook events for ${Math.floor((now - lastEventMs) / 86_400_000)}d (LIVE)`,
  });

  const since = new Date(now - DEDUPE_HOURS * 3_600_000).toISOString();
  const fired: any[] = [];
  for (const alert of alerts) {
    const { data: existing } = await admin.from("telemetry_alerts")
      .select("id")
      .eq("alert_type", alert.type)
      .gte("created_at", since)
      .limit(1);
    if (existing?.length) {
      fired.push({ type: alert.type, skipped: "deduped" });
      continue;
    }
    await admin.from("telemetry_alerts").insert({
      alert_type: alert.type,
      severity: alert.severity,
      description: alert.description,
      metadata: {
        environment,
        webhook_url: webhookUrl,
        reach_status: reachDetail,
        minutes_since_last: minutesSinceLast,
        last_event_at: lastEventMs ? new Date(lastEventMs).toISOString() : null,
      },
    });

    const recipientEmail = Deno.env.get("PAYSTACK_ALERT_EMAIL") || Deno.env.get("ADMIN_ALERT_EMAIL") || "support@habtastic.com";
    try {
      await fetch(`${url}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateName: "paystack-webhook-alert",
          recipientEmail,
          idempotencyKey: `paystack-alert-${alert.type}-${Math.floor(now / (DEDUPE_HOURS * 3_600_000))}`,
          templateData: {
            alertType: alert.type,
            environment,
            webhookUrl,
            detail: alert.description,
            minutesSinceLast,
            reachStatus: reachDetail,
            detectedAt: new Date(now).toISOString(),
          },
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      console.error("[paystack-webhook-monitor] alert email failed", error);
    }
    fired.push({ type: alert.type, fired: true });
  }

  return json({
    ok: true,
    environment,
    reachOk,
    reachDetail,
    retrySweep,
    lastEventAt: lastEventMs ? new Date(lastEventMs).toISOString() : null,
    minutesSinceLast,
    fired,
  });
});
