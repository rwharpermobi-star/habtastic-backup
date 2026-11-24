// Initialize a Paystack Premium checkout. Returns the hosted authorization URL.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, paystack, PLANS, type PlanKey, getEnvironment, isConfiguredPaystackPlan, listPaystackPlans, isAllowedCallbackUrl } from "../_shared/paystack.ts";
import { BLOCKING_SUBSCRIPTION_STATUSES, findBlockingSubscription } from "../_shared/subscriptionGuard.ts";
import { enforceRateLimit, enforceIpRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const adminForRl = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ipRl = await enforceIpRateLimit(adminForRl, req, [
      { action: "paystack_init_ip_min", windowSeconds: 60, max: 10 },
      { action: "paystack_init_ip_hour", windowSeconds: 3600, max: 60 },
    ], { name: "paystack-init", corsHeaders });
    if (ipRl) return ipRl;

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const rl = await enforceRateLimit(supabase, [
      { action: "paystack_init_min", windowSeconds: 60, max: 5 },
      { action: "paystack_init_hour", windowSeconds: 3600, max: 30 },
    ], { name: "paystack-init", userId: user.id, corsHeaders });
    if (rl) return rl;

    const body = await req.json().catch(() => ({}));
    const planKey = body.plan as PlanKey;
    const callbackUrl: string = body.callbackUrl;
    if (!planKey || !(planKey in PLANS) || !isAllowedCallbackUrl(callbackUrl)) {
      return new Response(JSON.stringify({ error: "Invalid plan or callbackUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const plan = PLANS[planKey];

    // One paid subscription per user across Google Play and the website.
    const { data: liveSubs, error: liveErr } = await adminForRl
      .from("subscriptions")
      .select("provider, status, current_period_end")
      .eq("user_id", user.id)
      .in("status", BLOCKING_SUBSCRIPTION_STATUSES);
    if (liveErr) {
      console.error("[paystack-init] subscription check failed", liveErr.message);
      return new Response(JSON.stringify({ error: "Could not check your current subscription. Please try again." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const existing = findBlockingSubscription(liveSubs as any[]);
    if (existing) {
      return new Response(JSON.stringify({ error: "You already have an active Premium subscription.", code: "already_subscribed", provider: existing.provider }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let planCode: string | undefined;
    const checkoutAmount = plan.amount;
    if (!plan.oneTime) {
      try {
        const items = await listPaystackPlans();
        const found = items.find((p: any) =>
          isConfiguredPaystackPlan(p, planKey) && Number(p?.amount) === plan.amount
        );
        planCode = found?.plan_code;
      } catch (_) { /* ignore: best effort */ }
      if (!planCode) {
        const created = await paystack<any>(`/plan`, {
          method: "POST",
          body: JSON.stringify({
            name: plan.name,
            interval: plan.interval,
            amount: plan.amount,
            currency: plan.currency,
          }),
        });
        planCode = created?.data?.plan_code;
      }
      if (!planCode) throw new Error("Could not resolve Paystack plan code");
    }

    const reference = `htx-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;
    const checkoutMetadata = {
      kind: "premium_subscription",
      user_id: user.id,
      plan_key: planKey,
      ...(planCode ? { plan_code: planCode } : {}),
    };
    const initPayload: Record<string, unknown> = {
      email: user.email,
      amount: checkoutAmount,
      currency: plan.currency,
      reference,
      callback_url: callbackUrl,
      metadata: checkoutMetadata,
    };
    if (planCode) initPayload.plan = planCode;

    // Persist the checkout identity before contacting Paystack. If the provider
    // creates a transaction but the response is lost, the signed webhook can
    // still reconcile it against this pending row. Never call Paystack if the
    // local record could not be written.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: stageError } = await admin.from("subscriptions").insert({
      user_id: user.id,
      plan_code: planCode,
      plan_interval: plan.oneTime ? "one_time" : plan.interval,
      status: "pending",
      amount: checkoutAmount,
      currency: plan.currency,
      environment: getEnvironment(),
      metadata: {
        kind: "premium_subscription",
        plan_key: planKey,
        payment_reference: reference,
        checkout_init_state: "pending",
      },
    });
    if (stageError) throw stageError;

    let init: any;
    try {
      init = await paystack<any>(`/transaction/initialize`, {
        method: "POST",
        body: JSON.stringify(initPayload),
      });
      if (!init?.data?.authorization_url) throw new Error("Checkout initialization response missing authorization URL");
    } catch (error) {
      // Provider errors can be ambiguous (for example, a network timeout after
      // Paystack created the transaction). Keep the row pending for webhook or
      // support reconciliation instead of deleting it or marking it definitively
      // failed. The client receives only a generic error.
      await admin.from("subscriptions").update({
        metadata: {
          kind: "premium_subscription",
          plan_key: planKey,
          payment_reference: reference,
          checkout_init_state: "unknown",
        },
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id)
        .eq("status", "pending")
        .contains("metadata", { payment_reference: reference });
      console.error("[paystack-init] transaction initialization failed; staged checkout retained for reconciliation", {
        reference,
        error: String(error).slice(0, 300),
      });
      throw new Error("Checkout initialization failed");
    }

    console.log(`[paystack-init] mode=${getEnvironment().toUpperCase()} plan=${planKey} user=${user.id} ref=${reference}`);
    return new Response(
      JSON.stringify({ authorization_url: init.data.authorization_url, reference }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("paystack-init error:", e);
    return new Response(JSON.stringify({ error: "Checkout temporarily unavailable" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
