// Scheduled retention job. Calls public.run_retention_jobs() with service-role
// privileges and returns the per-table deletion counts. Designed to be
// triggered by pg_cron (see migration `*_schedule_retention_jobs.sql`).
//
// Safety:
// - Idempotent: deleting old rows is naturally idempotent; re-running just
//   yields zero on the second pass.
// - Requires the caller to present either the SERVICE_ROLE key OR a shared
//   `RETENTION_JOB_SECRET` (set via Supabase secrets) so a leaked anon key
//   cannot trigger pruning.
// - Errors are logged + surfaced as 500 so pg_cron's net.http_post job
//   history shows the failure.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retention-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const URL = Deno.env.get("SUPABASE_URL")!;
  const SHARED_SECRET = Deno.env.get("RETENTION_JOB_SECRET");

  // Auth: accept either the service-role key in Authorization, or a shared
  // secret header that pg_cron passes. Reject everything else.
  const auth = req.headers.get("authorization") ?? "";
  const headerSecret = req.headers.get("x-retention-secret") ?? "";
  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  const bearer = bearerMatch?.[1];
  const isServiceRole = bearer === SERVICE_ROLE;
  const hasSharedSecret = !!SHARED_SECRET && headerSecret === SHARED_SECRET;
  if (!isServiceRole && !hasSharedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  try {
    const admin = createClient(URL, SERVICE_ROLE);
    const { data, error } = await admin.rpc("run_retention_jobs");
    if (error) throw error;
    const durationMs = Date.now() - startedAt;
    console.log("[retention-jobs] success", { durationMs, counts: data });
    return new Response(JSON.stringify({ ok: true, durationMs, counts: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[retention-jobs] failed", { message });
    return new Response(JSON.stringify({ ok: false, error: "Retention job failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
