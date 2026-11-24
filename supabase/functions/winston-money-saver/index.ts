import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleWinstonMoneySaverTurn } from "../_shared/winstonMoneySaver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PREMIUM_QUICK_ACTIONS = [
  "Give me a short, energetic motivational push right now",
  "Coach me on eating better",
  "Create a beginner-friendly workout I can do this week",
  "Help me improve my sleep",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [minuteLimit, dayLimit] = await Promise.all([
      authClient.rpc("rate_limit_check", { _action: "winston_money_saver_minute", _window_seconds: 60, _max: 30 }),
      authClient.rpc("rate_limit_check", { _action: "winston_money_saver_day", _window_seconds: 86400, _max: 600 }),
    ]);
    const limitError = minuteLimit.error || dayLimit.error;
    if (limitError && String(limitError.message || "").includes("rate_limited")) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    for (const msg of body.messages) {
      if (!msg || (msg.role !== 'user' && msg.role !== 'assistant') || typeof msg.content !== 'string' || msg.content.length === 0 || msg.content.length > 10000) {
        return new Response(JSON.stringify({ error: "Invalid message format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const lastUserMessage = [...body.messages].reverse().find((m: { role: string }) => m.role === "user");
    const requestedPremiumAction = typeof lastUserMessage?.content === "string"
      && PREMIUM_QUICK_ACTIONS.some((prompt) => lastUserMessage.content.trim().startsWith(prompt));

    if (requestedPremiumAction) {
      const { data: premium, error: premiumError } = await authClient.rpc("user_is_premium", { _user_id: user.id });
      if (premiumError) {
        console.error("[winston-money-saver] premium check failed", premiumError);
        return new Response(JSON.stringify({ error: "Unable to verify Premium access" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!premium) {
        return new Response(JSON.stringify({
          error: "premium_required",
          message: "This Winston coaching action is available with Premium.",
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const adminClient = createClient(url, serviceRole, { auth: { persistSession: false } });
    const moneyTurn = await handleWinstonMoneySaverTurn({
      authClient,
      adminClient,
      userId: user.id,
      messages: body.messages,
      apiKey: lovableApiKey,
      stream: !!body.stream,
      corsHeaders,
    });

    if (moneyTurn.response) return moneyTurn.response;

    const existingContext = typeof body.habitContext === "string" ? body.habitContext : "";
    const forwardedBody = {
      ...body,
      habitContext: `${existingContext}${moneyTurn.context}`,
    };

    const upstream = await fetch(`${url}/functions/v1/ai-coach`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: anon,
      },
      body: JSON.stringify(forwardedBody),
    });

    const contentType = upstream.headers.get("Content-Type") || "application/json";
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        ...(contentType.includes("text/event-stream") ? { "Cache-Control": "no-cache" } : {}),
      },
    });
  } catch (e) {
    console.error("winston-money-saver error", e);
    return new Response(JSON.stringify({ error: "Winston is temporarily unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
