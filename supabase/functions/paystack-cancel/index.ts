// Cancel the caller's active Paystack subscription. The user keeps access
// until current_period_end (webhook subscription.disable handles the row).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, paystack, getEnvironment } from "../_shared/paystack.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rl = await enforceRateLimit(supabase, [
      { action: "paystack_cancel_hour", windowSeconds: 3600, max: 5 },
      { action: "paystack_cancel_day", windowSeconds: 86400, max: 10 },
    ], { name: "paystack-cancel", userId: userData.user.id, corsHeaders });
    if (rl) return rl;



    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: sub } = await admin
      .from("subscriptions")
      .select("paystack_subscription_code, email_token, status, current_period_end")
      .eq("user_id", userData.user.id)
      .eq("environment", getEnvironment())
      .in("status", ["active", "attention", "non-renewing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.paystack_subscription_code || !sub?.email_token) {
      // Idempotent: nothing to cancel is not an error (double-click, already canceled, free user).
      return new Response(JSON.stringify({ ok: true, alreadyInactive: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      await paystack(`/subscription/disable`, {
        method: "POST",
        body: JSON.stringify({
          code: sub.paystack_subscription_code,
          token: sub.email_token,
        }),
      });
    } catch (e) {
      const msg = String(e);
      // If Paystack says it's already inactive / not found, treat as success
      // and reconcile our local row below.
      if (!/not_found|already inactive|404/i.test(msg)) throw e;
      console.log("paystack-cancel: subscription already inactive, syncing local row");
    }

    // Disabling renewal must not revoke the already-paid period. Keep the row
    // blocking another purchase until its paid-through timestamp has elapsed.
    const paidThrough = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const stillEntitled = !!paidThrough && paidThrough.getTime() > Date.now();
    const { error: subscriptionUpdateError } = await admin.from("subscriptions").update({
      status: stillEntitled ? "non-renewing" : "canceled",
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("paystack_subscription_code", sub.paystack_subscription_code);
    if (subscriptionUpdateError) throw subscriptionUpdateError;

    // Preserve the paid-through entitlement immediately; do not depend on the
    // asynchronous Paystack webhook to keep access alive after cancellation.
    if (paidThrough) {
      const { data: profile, error: profileReadError } = await admin.from("profiles")
        .select("is_premium,premium_until")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (profileReadError) throw profileReadError;

      const existingUntil = profile?.premium_until ? new Date(profile.premium_until) : null;
      const hasIndependentEntitlement = Boolean(
        profile?.is_premium && (!existingUntil || existingUntil.getTime() > paidThrough.getTime()),
      );
      const premiumRemains = stillEntitled || hasIndependentEntitlement;
      const effectiveUntil = hasIndependentEntitlement
        ? profile?.premium_until ?? null
        : stillEntitled ? paidThrough.toISOString() : null;

      const { error: profileUpdateError } = await admin.from("profiles").update({
        is_premium: premiumRemains,
        premium_until: effectiveUntil,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userData.user.id);
      if (profileUpdateError) throw profileUpdateError;
    }

    return new Response(JSON.stringify({ ok: true, premium_until: paidThrough?.toISOString() ?? null, premium_kept_until_expiry: stillEntitled }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("paystack-cancel error:", e);
    return new Response(JSON.stringify({ error: "Subscription cancellation temporarily unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
