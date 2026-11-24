// Saves (upserts) a browser Web Push subscription for the calling user.
// Verbose logging is intentional: push failures are otherwise invisible.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const mask = (s: string) => `${s.slice(0, 24)}…${s.slice(-8)} (len=${s.length})`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user) {
      console.warn("[push-subscribe] unauthorized", authError?.message ?? "no user");
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { endpoint, p256dh, auth, user_agent, unregister } = body || {};

    if (typeof endpoint !== "string" || endpoint.length < 20 || endpoint.length > 4096) {
      return json({ error: "invalid_endpoint" }, 400);
    }
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:") return json({ error: "invalid_endpoint" }, 400);
    } catch {
      return json({ error: "invalid_endpoint" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (unregister === true) {
      const { error } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);
      if (error) {
        console.error("[push-subscribe] unregister failed", {
          user_id: user.id,
          endpoint: mask(endpoint),
          code: error.code,
        });
        return json({ error: "unregister_failed" }, 500);
      }
      return json({ ok: true, removed: true });
    }

    if (
      typeof p256dh !== "string" || p256dh.length < 20 || p256dh.length > 1024 ||
      typeof auth !== "string" || auth.length < 8 || auth.length > 1024
    ) {
      console.warn("[push-subscribe] invalid key material", {
        user_id: user.id,
        endpoint: mask(endpoint),
      });
      return json({ error: "invalid_subscription" }, 400);
    }

    const row = {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: typeof user_agent === "string" ? user_agent.slice(0, 512) : null,
      last_seen_at: new Date().toISOString(),
    };

    // The endpoint is globally unique. Never use a service-role upsert keyed by
    // caller-supplied endpoint because that could overwrite another user's row.
    const { data: existing, error: lookupError } = await admin
      .from("push_subscriptions")
      .select("id,user_id")
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (lookupError) {
      console.error("[push-subscribe] lookup failed", {
        user_id: user.id,
        endpoint: mask(endpoint),
        code: lookupError.code,
      });
      return json({ error: "subscription_failed" }, 500);
    }

    if (existing && existing.user_id !== user.id) {
      console.warn("[push-subscribe] refused cross-account endpoint claim", {
        user_id: user.id,
        endpoint: mask(endpoint),
      });
      return json({ error: "endpoint_conflict" }, 409);
    }

    let data: { id: string } | null = null;
    let error: { code?: string; message?: string } | null = null;

    if (existing) {
      const result = await admin
        .from("push_subscriptions")
        .update({
          p256dh,
          auth,
          user_agent: row.user_agent,
          last_seen_at: row.last_seen_at,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      data = result.data as { id: string } | null;
      error = result.error;
    } else {
      const result = await admin
        .from("push_subscriptions")
        .insert(row)
        .select("id")
        .maybeSingle();

      if (result.error?.code === "23505") {
        const { data: raced } = await admin
          .from("push_subscriptions")
          .select("id,user_id")
          .eq("endpoint", endpoint)
          .maybeSingle();

        if (!raced || raced.user_id !== user.id) {
          return json({ error: "endpoint_conflict" }, 409);
        }

        const retry = await admin
          .from("push_subscriptions")
          .update({
            p256dh,
            auth,
            user_agent: row.user_agent,
            last_seen_at: row.last_seen_at,
          })
          .eq("id", raced.id)
          .eq("user_id", user.id)
          .select("id")
          .maybeSingle();
        data = retry.data as { id: string } | null;
        error = retry.error;
      } else {
        data = result.data as { id: string } | null;
        error = result.error;
      }
    }

    if (error) {
      console.error("[push-subscribe] save failed", {
        user_id: user.id,
        endpoint: mask(endpoint),
        code: error.code,
      });
      return json({ error: "subscription_failed" }, 500);
    }

    console.log("[push-subscribe] saved", {
      user_id: user.id,
      row_id: data?.id ?? null,
      endpoint: mask(endpoint),
    });
    return json({ ok: true, id: data?.id ?? null });
  } catch (e) {
    console.error("[push-subscribe] unexpected error");
    return json({ error: "subscription_failed" }, 500);
  }
});
