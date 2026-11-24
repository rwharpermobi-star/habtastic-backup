// Webhook health check. Admin-only: reveals Paystack env/secret status,
// so we require an authenticated admin caller before returning diagnostics.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, CURRENCY, WEBHOOK_URL, getEnvironment } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Require admin caller. Config diagnostics must not be public.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing_auth" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = auth.replace("Bearer ", "");
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: claimsResp, error: claimsErr } = await userClient.auth.getClaims(token);
  const uid = claimsResp?.claims?.sub as string | undefined;
  if (claimsErr || !uid) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(url, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const webhookSecret = !!Deno.env.get("PAYSTACK_WEBHOOK_URL");
  checks.push({
    name: "PAYSTACK_WEBHOOK_URL secret",
    ok: webhookSecret,
    detail: webhookSecret ? WEBHOOK_URL : "Secret not set — falling back to derived URL",
  });

  const paystackSecret = !!Deno.env.get("PAYSTACK_SECRET_KEY");
  checks.push({
    name: "PAYSTACK_SECRET_KEY secret",
    ok: paystackSecret,
    detail: paystackSecret ? `env: ${getEnvironment()}` : "Missing — webhook signature verification will fail",
  });

  const currencyOk = /^[A-Z]{3}$/.test(CURRENCY);
  checks.push({
    name: "Currency resolution",
    ok: currencyOk,
    detail: `Resolved: ${CURRENCY} (default USD when PAYSTACK_CURRENCY unset)`,
  });

  let handlerOk = false;
  let handlerDetail = "";
  try {
    const { error } = await admin
      .from("paystack_webhook_events")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    handlerOk = !error;
    if (error) console.error("[paystack-health] DB check failed", error);
    handlerDetail = error ? "Database health check failed" : "paystack_webhook_events reachable";
  } catch (e) {
    console.error("[paystack-health] DB check threw", e);
    handlerDetail = "Database health check failed";
  }
  checks.push({ name: "Handler DB write path", ok: handlerOk, detail: handlerDetail });

  // Live reachability probe: POST an invalid-signature payload to the deployed
  // webhook URL. A healthy handler responds with a non-5xx status (typically
  // 400/401 for the bad signature). 5xx or network failure = unreachable.
  let reachOk = false;
  let reachDetail = "";
  try {
    const probe = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": "healthcheck-invalid-signature",
      },
      body: JSON.stringify({ event: "healthcheck.ping", data: {} }),
      signal: AbortSignal.timeout(8000),
    });
    reachOk = probe.status > 0 && probe.status < 500;
    reachDetail = `HTTP ${probe.status} from ${WEBHOOK_URL} (invalid-signature probe; non-5xx = reachable)`;
  } catch (e) {
    console.error("[paystack-health] webhook probe failed", e);
    reachDetail = "Webhook endpoint unreachable";
  }
  checks.push({ name: "Webhook URL reachable", ok: reachOk, detail: reachDetail });

  // Recent event activity (last 24h + last 7d + newest event).
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent: {
    last24h: number;
    last7d: number;
    lastEventAt: string | null;
    lastEventType: string | null;
    lastEventStatus: string | null;
    minutesSinceLast: number | null;
    byType: Record<string, number>;
    errorsLast7d: number;
    sample: Array<{
      received_at: string;
      event_type: string;
      status: string;
      error_message: string | null;
    }>;
  } = {
    last24h: 0, last7d: 0, lastEventAt: null, lastEventType: null,
    lastEventStatus: null, minutesSinceLast: null, byType: {}, errorsLast7d: 0, sample: [],
  };
  try {
    const [{ count: c24 }, { count: c7 }, { data: latest }, { data: sample }, { count: errCount }] =
      await Promise.all([
        admin.from("paystack_webhook_events").select("id", { head: true, count: "exact" }).gte("received_at", dayAgo),
        admin.from("paystack_webhook_events").select("id", { head: true, count: "exact" }).gte("received_at", weekAgo),
        admin.from("paystack_webhook_events").select("received_at,event_type,status").order("received_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("paystack_webhook_events").select("received_at,event_type,status,error_message").order("received_at", { ascending: false }).limit(10),
        admin.from("paystack_webhook_events").select("id", { head: true, count: "exact" }).gte("received_at", weekAgo).eq("status", "error"),
      ]);
    recent.last24h = c24 ?? 0;
    recent.last7d = c7 ?? 0;
    recent.errorsLast7d = errCount ?? 0;
    if (latest) {
      recent.lastEventAt = latest.received_at;
      recent.lastEventType = latest.event_type;
      recent.lastEventStatus = latest.status;
      recent.minutesSinceLast = Math.floor((now - new Date(latest.received_at).getTime()) / 60000);
    }
    if (sample) {
      recent.sample = sample as typeof recent.sample;
      for (const row of sample) {
        recent.byType[row.event_type] = (recent.byType[row.event_type] ?? 0) + 1;
      }
    }
  } catch (_e) {
    // best-effort; leave defaults
  }

  const recentOk = recent.last7d > 0;
  checks.push({
    name: "Recent webhook events (7d)",
    ok: recentOk,
    detail: recentOk
      ? `${recent.last7d} events in last 7d, ${recent.last24h} in last 24h`
      : "No events received in last 7 days — send a real transaction to verify",
  });

  const allOk = checks.every((c) => c.ok);
  return new Response(
    JSON.stringify({
      healthy: allOk,
      environment: getEnvironment(),
      webhookUrl: WEBHOOK_URL,
      recent,
      checks,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
