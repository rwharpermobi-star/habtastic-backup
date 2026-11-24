import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { generateAvatar } from "./generation.ts";

serve(async (req) => {
  const reply = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!url || !anonKey || !serviceKey || !apiKey) {
      const missing = [!url && "SUPABASE_URL", !anonKey && "SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY", !apiKey && "OPENAI_API_KEY"].filter(Boolean);
      console.error("[generate-avatar] missing environment configuration", missing);
      return reply({ error: "Avatar service configuration is unavailable.", code: "MISSING_CONFIGURATION" }, 503);
    }
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return reply({ error: "Unauthorized" }, 401);
    const limited = await enforceRateLimit(client, [
      { action: "generate_avatar_min", windowSeconds: 60, max: 5 },
      { action: "generate_avatar_hour", windowSeconds: 3600, max: 30 },
    ], { name: "generate-avatar", userId: user.id, corsHeaders });
    if (limited) return limited;
    let body: unknown;
    try { body = await req.json(); } catch { return reply({ error: "Invalid JSON request" }, 400); }
    const result = await generateAvatar(user.id, body, {
      admin: createClient(url, serviceKey), fetchGateway: fetch, apiKey,
    });
    return reply(result.payload, result.status);
  } catch {
    return reply({ error: "Avatar generation could not finish. Please check your connection." }, 500);
  }
});
