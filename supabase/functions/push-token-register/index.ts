// Registers or refreshes an FCM/APNs device token for the calling user.
// Called from the mobile app when @capacitor/push-notifications receives
// a registration token, and on token refresh events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enforceIpRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Never log a full token — only enough to correlate rows during debugging.
const mask = (t: string) => `${t.slice(0, 8)}…${t.slice(-6)} (len=${t.length})`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ipRl = await enforceIpRateLimit(admin, req, [
      { action: "push_token_register_ip_min", windowSeconds: 60, max: 20 },
      { action: "push_token_register_ip_hour", windowSeconds: 3600, max: 200 },
    ], { name: "push-token-register", corsHeaders });
    if (ipRl) return ipRl;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      console.warn("[push-token-register] unauthorized (no valid JWT)");
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { token, platform, app_version, unregister } = body || {};
    if (
      typeof token !== "string" || token.length < 20 || token.length > 4096 ||
      !platform || !["android", "ios", "web"].includes(platform)
    ) {
      console.warn("[push-token-register] invalid payload", {
        user_id: user.id,
        platform,
        token_len: typeof token === "string" ? token.length : null,
      });
      return json({ error: "missing/invalid fields" }, 400);
    }

    if (unregister === true) {
      const { error } = await admin.from("device_tokens")
        .delete().eq("user_id", user.id).eq("token", token);
      if (error) throw error;
      console.log("[push-token-register] removed", { user_id: user.id, token: mask(token) });
      return json({ ok: true, removed: true });
    }

    const now = new Date().toISOString();
    const appVersion = typeof app_version === "string" ? app_version.slice(0, 64) : null;

    // A caller must never be able to claim a globally unique token that is
    // already owned by a different account. Service-role writes therefore
    // use insert/update-by-owned-id, never an upsert on the caller-supplied token.
    const { data: existing, error: lookupError } = await admin
      .from("device_tokens")
      .select("id,user_id")
      .eq("token", token)
      .maybeSingle();

    if (lookupError) {
      console.error("[push-token-register] token lookup failed", {
        user_id: user.id,
        platform,
        token: mask(token),
        code: lookupError.code,
      });
      return json({ error: "registration_failed" }, 500);
    }

    if (existing && existing.user_id !== user.id) {
      console.warn("[push-token-register] refused cross-account token claim", {
        user_id: user.id,
        token: mask(token),
      });
      return json({ error: "token_conflict" }, 409);
    }

    let data: { id: string } | null = null;
    let error: { code?: string; message?: string; details?: string } | null = null;

    if (existing) {
      const result = await admin
        .from("device_tokens")
        .update({
          platform,
          app_version: appVersion,
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", existing.id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      data = result.data as { id: string } | null;
      error = result.error;
    } else {
      const result = await admin
        .from("device_tokens")
        .insert({
          user_id: user.id,
          token,
          platform,
          app_version: appVersion,
          last_seen_at: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();

      // Handle a race safely: a concurrent insert may have claimed this token.
      if (result.error?.code === "23505") {
        const { data: raced } = await admin
          .from("device_tokens")
          .select("id,user_id")
          .eq("token", token)
          .maybeSingle();

        if (!raced || raced.user_id !== user.id) {
          console.warn("[push-token-register] token conflict after insert race", {
            user_id: user.id,
            token: mask(token),
          });
          return json({ error: "token_conflict" }, 409);
        }

        const retry = await admin
          .from("device_tokens")
          .update({
            platform,
            app_version: appVersion,
            last_seen_at: now,
            updated_at: now,
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
      console.error("[push-token-register] save failed", {
        user_id: user.id,
        platform,
        token: mask(token),
        code: error.code,
      });
      return json({ error: "registration_failed" }, 500);
    }

    console.log("[push-token-register] saved", {
      user_id: user.id,
      row_id: data?.id ?? null,
      platform,
      token: mask(token),
    });
    return json({ ok: true, saved: true, id: data?.id ?? null });
  } catch (e) {
    console.error("[push-token-register] unexpected error");
    return json({ error: "registration_failed" }, 500);
  }
});
