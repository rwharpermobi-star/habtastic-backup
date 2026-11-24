// Scheduled telemetry alerting. Runs every 15 minutes via pg_cron and
// inspects recent `client_telemetry_events` to fire alerts for elevated
// error rates and slow endpoints. Records each fired alert into
// `security_alerts` (admin-readable) and logs to function logs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retention-secret",
};

const WINDOW_MIN = 60;
const ERROR_SPIKE_1H = 20;
const ERROR_RATE_PCT = 5;
const MIN_SAMPLE = 50;
const SLOW_API_P95_MS = 1500;
const SLOW_LCP_MS = 4000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sharedSecret = Deno.env.get("RETENTION_JOB_SECRET");

  // Auth: cron must present service-role bearer or shared secret header.
  const auth = req.headers.get("authorization") ?? "";
  const headerSecret = req.headers.get("x-retention-secret") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  const isServiceRole = bearer === serviceKey;
  const hasSharedSecret = !!sharedSecret && headerSecret === sharedSecret;
  if (!isServiceRole && !hasSharedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey);


  const sinceIso = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { data, error } = await admin
    .from("client_telemetry_events")
    .select("kind, api_p95_ms, lcp_ms, route, created_at")
    .gte("created_at", sinceIso)
    .limit(5000);

  if (error) {
    console.error("[telemetry-alerts] fetch failed", error);
    return new Response(JSON.stringify({ error: "fetch_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = data ?? [];
  const errors = rows.filter((r: any) => r.kind === "error").length;
  const total = rows.length;
  const apiP95s = rows.map((r: any) => r.api_p95_ms).filter((n: any) => typeof n === "number" && n > 0);
  const lcps = rows.map((r: any) => r.lcp_ms).filter((n: any) => typeof n === "number" && n > 0);
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const apiP95Avg = avg(apiP95s);
  const lcpAvg = avg(lcps);
  const errorRate = total > 0 ? (errors / total) * 100 : 0;

  const fired: { type: string; severity: string; description: string }[] = [];
  if (errors >= ERROR_SPIKE_1H) {
    fired.push({ type: "error_spike", severity: "high",
      description: `${errors} client errors in last ${WINDOW_MIN}m (threshold ${ERROR_SPIKE_1H})` });
  }
  if (total >= MIN_SAMPLE && errorRate >= ERROR_RATE_PCT) {
    fired.push({ type: "elevated_error_rate", severity: "high",
      description: `Error rate ${errorRate.toFixed(1)}% over ${WINDOW_MIN}m (threshold ${ERROR_RATE_PCT}%)` });
  }
  if (apiP95Avg >= SLOW_API_P95_MS) {
    fired.push({ type: "slow_api", severity: "medium",
      description: `API p95 avg ${apiP95Avg}ms exceeds ${SLOW_API_P95_MS}ms` });
  }
  if (lcpAvg >= SLOW_LCP_MS) {
    fired.push({ type: "slow_lcp", severity: "medium",
      description: `LCP avg ${lcpAvg}ms exceeds ${SLOW_LCP_MS}ms` });
  }

  // Dedupe: only insert alerts that haven't fired in the last hour.
  let inserted = 0;
  for (const alert of fired) {
    const { data: existing } = await admin
      .from("telemetry_alerts")
      .select("id")
      .eq("alert_type", alert.type)
      .gte("created_at", sinceIso)
      .limit(1);
    if (existing && existing.length > 0) continue;
    const { error: insErr } = await admin.from("telemetry_alerts").insert({
      alert_type: alert.type,
      severity: alert.severity,
      description: alert.description,
      metadata: { window_minutes: WINDOW_MIN, errors, total, api_p95_avg: apiP95Avg, lcp_avg: lcpAvg },
    });
    if (insErr) console.error("[telemetry-alerts] insert failed", insErr);
    else inserted++;
  }

  console.log(`[telemetry-alerts] window=${WINDOW_MIN}m errors=${errors} total=${total} apiP95=${apiP95Avg} lcp=${lcpAvg} fired=${fired.length} inserted=${inserted}`);

  return new Response(JSON.stringify({ ok: true, fired, inserted, stats: { errors, total, apiP95Avg, lcpAvg } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
