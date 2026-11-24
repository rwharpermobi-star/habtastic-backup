/**
 * Opt-in rewarded ads for extra Winston messages (Free users only).
 *
 * POST { action: "start" } → issues a one-time session code that the app
 * passes to AdMob as SSV custom_data. Nothing is granted here: messages are
 * only added by `admob-ssv` after Google's signed callback is verified.
 *
 * Older app builds POST {} expecting coins; they get a safe "disabled" reply.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { action?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body = legacy coin request */ }
  if (body?.action !== "start") {
    return json({ granted: false, reason: "temporarily_disabled", remaining: 0 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  if (!bearer || bearer[1].split(".").length !== 3) {
    console.error("admob-reward: 401 missing or malformed Authorization header");
    return json({ error: "Unauthorized" }, 401);
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user || user.role !== "authenticated" || user.is_anonymous) {
    console.error("admob-reward: 401 getUser failed", userError?.message ?? "not a signed-in account");
    return json({ error: "Unauthorized" }, 401);
  }

  const rl = await enforceRateLimit(supabase, [
    { action: "winston_ad_start_min", windowSeconds: 60, max: 6 },
    { action: "winston_ad_start_day", windowSeconds: 86400, max: 40 },
  ], { name: "admob-reward", userId: user.id, corsHeaders });
  if (rl) return rl;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("start_winston_ad_reward_for", { _uid: user.id });
  if (error) {
    console.error("admob-reward: 500 start_winston_ad_reward_for failed", error.message);
    return json({ error: "Could not start the ad reward" }, 500);
  }
  return json(data ?? { ok: false, reason: "unknown" });
});
