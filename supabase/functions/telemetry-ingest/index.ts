// Ingest crash + RUM events from authenticated clients only.
// The Supabase gateway verifies the JWT and this function independently
// resolves the user before accepting telemetry. Database writes use the
// service role only; clients have no direct INSERT grant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enforceIpRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_EVENTS_PER_BATCH = 50;
const MAX_FIELD_LEN = 2000;

type IncomingEvent = {
  kind: "error" | "perf" | "event";
  category?: string;
  level?: string;
  message?: string;
  route?: string;
  app_version?: string;
  session_id?: string;
  context?: Record<string, unknown>;
  fcp_ms?: number | null;
  lcp_ms?: number | null;
  tti_ms?: number | null;
  api_p95_ms?: number | null;
};

// Defense-in-depth PII scrubbing — client already scrubs, but never trust input.
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/(access_token|refresh_token|id_token|token|code|otp|api[_-]?key)=([^&\s"']+)/gi, "$1=[redacted]"],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]"],
];
const scrub = (s: string) => PII_PATTERNS.reduce((acc, [re, sub]) => acc.replace(re, sub), s);
const truncate = (v: unknown, n = MAX_FIELD_LEN) => {
  if (typeof v !== "string") return v;
  const cleaned = scrub(v);
  return cleaned.length > n ? cleaned.slice(0, n) : cleaned;
};
const scrubRoute = (v: unknown) =>
  typeof v === "string" ? truncate(v.split("?")[0].split("#")[0], 256) : v;
const scrubContext = (c: Record<string, unknown> | null | undefined) => {
  if (!c) return null;
  try { return JSON.parse(scrub(JSON.stringify(c))); } catch { return null; }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { events?: IncomingEvent[] };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const events = (body.events ?? []).slice(0, MAX_EVENTS_PER_BATCH);
  if (!events.length) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const ipRl = await enforceIpRateLimit(admin, req, [
    { action: "telemetry_ingest_ip_min", windowSeconds: 60, max: 120 },
    { action: "telemetry_ingest_ip_hour", windowSeconds: 3600, max: 2000 },
  ], { name: "telemetry-ingest", corsHeaders });
  if (ipRl) return ipRl;


  // Defense in depth: do not trust the gateway check alone. Resolve the
  // authenticated user and reject missing/invalid sessions before any write.
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!bearer || bearer.split(".").length !== 3) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let userId: string | null = null;
  try {
    const { data, error } = await admin.auth.getUser(bearer);
    if (error) throw error;
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ua = truncate(req.headers.get("user-agent") ?? "", 500) as string;
  const rows = events
    .filter((e) => e && (e.kind === "error" || e.kind === "perf" || e.kind === "event"))
    .map((e) => ({
      user_id: userId,
      session_id: truncate(e.session_id ?? null, 64),
      event_name: truncate(e.category ?? e.kind, 64),
      properties: {
        kind: e.kind,
        category: truncate(e.category ?? null, 64),
        level: truncate(e.level ?? null, 32),
        message: truncate(e.message ?? null),
        route: scrubRoute(e.route ?? null),
        app_version: truncate(e.app_version ?? null, 64),
        user_agent: ua,
        context: scrubContext(e.context ?? null),
        fcp_ms: e.fcp_ms ?? null,
        lcp_ms: e.lcp_ms ?? null,
        tti_ms: e.tti_ms ?? null,
        api_p95_ms: e.api_p95_ms ?? null,
      },
    }));


  const { error } = await admin.from("client_telemetry_events").insert(rows);
  if (error) {
    console.error("[telemetry-ingest] insert failed", error);
    return new Response(JSON.stringify({ error: "insert_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
