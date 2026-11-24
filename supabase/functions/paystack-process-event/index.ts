import { createClient } from "npm:@supabase/supabase-js@2";

const CURRENCY = (Deno.env.get("PAYSTACK_CURRENCY") || "ZAR").toUpperCase();
const PLANS = {
  monthly: { amount: 9499, currency: CURRENCY, interval: "monthly" },
  yearly: { amount: 89999, currency: CURRENCY, interval: "annually" },
} as const;
type PlanKey = keyof typeof PLANS;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function provisionalUntil(planKey: PlanKey): string {
  const days = planKey === "yearly" ? 366 : 31;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!serviceKey || !supabaseUrl) return json({ error: "server_not_configured" }, 503);
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  async function grantPremium(opts: {
    userId: string;
    premiumUntil: string | null;
    kind: string;
    eventId: string | null;
    reference: string | null;
    amount: number | null;
    currency: string | null;
  }): Promise<boolean> {
    const { data: applied, error } = await admin.rpc("apply_paystack_premium_grant", {
      _user_id: opts.userId,
      _event_id: opts.eventId,
      _reference: opts.reference,
      _kind: opts.kind,
      _premium_until: opts.premiumUntil,
      _amount: opts.amount,
      _currency: opts.currency,
    });
    if (error) {
      console.error("[paystack-process-event] atomic Premium grant failed", {
        userId: opts.userId,
        eventId: opts.eventId,
        code: (error as { code?: string }).code,
        message: error.message,
      });
      throw new Error(`Failed to apply Premium grant: ${error.message}`);
    }
    return applied === true;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const eventType = typeof body?.eventType === "string" ? body.eventType : "";
    const data = body?.data ?? {};
    const eventId = body?.eventId == null ? null : String(body.eventId);

    if (eventType === "charge.success") {
      if (data?.status !== "success") return json({ processed: false, reason: "not_success" });
      const kind = data?.metadata?.kind;
      const userId = typeof data?.metadata?.user_id === "string" ? data.metadata.user_id : "";
      const reference = typeof data?.reference === "string" ? data.reference : "";
      if (!userId || !reference) return json({ processed: false, reason: "missing_identity" });

      if (kind === "shop") {
        const productId = typeof data?.metadata?.product_id === "string" ? data.metadata.product_id : "";
        if (!productId || !/^htshop_[A-Za-z0-9._-]+$/.test(reference)) {
          return json({ processed: false, reason: "invalid_shop_reference" });
        }
        const { data: order, error: orderError } = await admin.from("shop_orders")
          .select("id,user_id,product_id,status,amount_cents,currency")
          .eq("paystack_reference", reference)
          .maybeSingle();
        if (orderError) throw orderError;
        if (!order) return json({ processed: false, reason: "order_not_found" });
        if (
          order.user_id !== userId ||
          order.product_id !== productId ||
          Number(order.amount_cents) !== Number(data?.amount) ||
          String(order.currency ?? "").toUpperCase() !== String(data?.currency ?? "").toUpperCase()
        ) {
          return json({ processed: false, reason: "shop_integrity_mismatch" }, 409);
        }
        if (order.status !== "fulfilled") {
          const { error: paidError } = await admin.from("shop_orders")
            .update({ status: "paid", updated_at: new Date().toISOString() })
            .eq("id", order.id)
            .in("status", ["pending", "paid"]);
          if (paidError) throw paidError;
          const { data: result, error: fulfillError } = await admin.rpc("fulfill_shop_order", {
            _reference: reference,
          });
          if (fulfillError) throw fulfillError;
          return json({ processed: true, kind: "shop", result });
        }
        return json({ processed: true, kind: "shop", duplicate: true });
      }

      if (kind === "premium_subscription") {
        if (!/^(?:htx-[A-Za-z0-9]{12}-\d+|htx_[A-Za-z0-9._-]+)$/.test(reference)) {
          return json({ processed: false, reason: "invalid_premium_reference" });
        }
        const rawPlanKey = data?.metadata?.plan_key;
        if (typeof rawPlanKey !== "string" || !(rawPlanKey in PLANS)) {
          return json({ processed: false, reason: "invalid_plan" });
        }
        const planKey = rawPlanKey as PlanKey;
        const plan = PLANS[planKey];
        const planCode = typeof data?.metadata?.plan_code === "string" ? data.metadata.plan_code : "";
        if (
          !planCode ||
          Number(data?.amount) !== plan.amount ||
          String(data?.currency ?? "").toUpperCase() !== plan.currency
        ) {
          return json({ processed: false, reason: "premium_amount_or_plan_mismatch" }, 409);
        }
        const { data: staged, error: stagedError } = await admin.from("subscriptions")
          .select("id,user_id,plan_code,amount,currency,status,environment,metadata")
          .eq("user_id", userId)
          .eq("status", "pending")
          .eq("environment", Deno.env.get("PAYSTACK_SECRET_KEY")?.startsWith("sk_live_") ? "live" : "test")
          .contains("metadata", {
            kind: "premium_subscription",
            plan_key: planKey,
            payment_reference: reference,
          })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (stagedError) throw stagedError;
        if (
          !staged ||
          staged.plan_code !== planCode ||
          Number(staged.amount) !== plan.amount ||
          String(staged.currency ?? "").toUpperCase() !== plan.currency
        ) {
          return json({ processed: false, reason: "checkout_record_mismatch" }, 409);
        }

        const until = provisionalUntil(planKey);
        const applied = await grantPremium({
          userId,
          premiumUntil: until,
          kind: "charge.success",
          eventId,
          reference,
          amount: Number(data.amount),
          currency: String(data.currency),
        });
        const { error: subError } = await admin.from("subscriptions").update({
          paystack_customer_code: data?.customer?.customer_code ?? null,
          paystack_customer_id: data?.customer?.id ?? null,
          amount: plan.amount,
          currency: plan.currency,
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: until,
          next_payment_date: until,
          updated_at: new Date().toISOString(),
        }).eq("id", staged.id);
        if (subError) throw subError;
        if (applied) {
          const { error: referralError } = await admin.rpc("qualify_referral_payment", {
            _referred_id: userId,
            _reference: reference,
            _provider: "paystack",
            _environment: staged.environment,
          });
          if (referralError) console.warn("paystack referral qualification failed", referralError);
        }
        return json({ processed: true, kind: "premium_subscription", duplicate: !applied });
      }

      // A signed Paystack success with no known purpose is deliberately ignored.
      return json({ processed: false, reason: "unknown_payment_kind" });
    }

    if (eventType === "subscription.create") {
      const customerCode = data?.customer?.customer_code;
      const planCode = data?.plan?.plan_code;
      const subCode = data?.subscription_code;
      if (!customerCode || !planCode || !subCode) return json({ processed: false, reason: "missing_subscription_identity" });
      const { data: local, error: localError } = await admin.from("subscriptions")
        .select("id,user_id,plan_code,amount,currency,metadata")
        .eq("paystack_customer_code", customerCode)
        .eq("plan_code", planCode)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (localError) throw localError;
      if (!local?.user_id || local.metadata?.kind !== "premium_subscription") {
        return json({ processed: false, reason: "unbound_subscription" });
      }
      const periodEnd = data?.next_payment_date ?? null;
      const { error: updateError } = await admin.from("subscriptions").update({
        paystack_subscription_code: subCode,
        paystack_subscription_id: data?.id ?? null,
        email_token: data?.email_token ?? null,
        plan_interval: data?.plan?.interval ?? null,
        status: data?.status || "active",
        current_period_end: periodEnd,
        next_payment_date: periodEnd,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      }).eq("id", local.id);
      if (updateError) throw updateError;
      // Subscription creation is not proof that the first payment succeeded.
      // Premium access is granted only by the verified charge/invoice success path.
      return json({ processed: true, kind: "subscription.create", userId: local.user_id, premium_granted: false });
    }

    if (eventType === "subscription.disable" || eventType === "subscription.not_renew") {
      const subCode = data?.subscription_code;
      if (!subCode) return json({ processed: false, reason: "missing_subscription_code" });
      const { data: local, error } = await admin.from("subscriptions")
        .select("id,user_id,current_period_end")
        .eq("paystack_subscription_code", subCode)
        .maybeSingle();
      if (error) throw error;
      if (!local) return json({ processed: false, reason: "subscription_not_found" });
      const periodEnd = local.current_period_end ?? null;
      const stillActive = !!periodEnd && new Date(periodEnd).getTime() > Date.now();
      await admin.from("subscriptions").update({
        status: stillActive ? "non-renewing" : "canceled",
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", local.id);
      const { data: profile, error: profileReadError } = await admin.from("profiles")
        .select("is_premium,premium_until")
        .eq("user_id", local.user_id)
        .maybeSingle();
      if (profileReadError) throw profileReadError;

      const existingUntil = profile?.premium_until ? new Date(profile.premium_until) : null;
      const paidThrough = periodEnd ? new Date(periodEnd) : null;
      const hasIndependentEntitlement = Boolean(
        profile?.is_premium && (!existingUntil || (paidThrough && existingUntil.getTime() > paidThrough.getTime())),
      );
      const premiumRemains = stillActive || hasIndependentEntitlement;
      const effectiveUntil = hasIndependentEntitlement
        ? profile?.premium_until ?? null
        : stillActive ? periodEnd : null;

      const { error: profileUpdateError } = await admin.from("profiles").update({
        is_premium: premiumRemains,
        premium_until: effectiveUntil,
        updated_at: new Date().toISOString(),
      }).eq("user_id", local.user_id);
      if (profileUpdateError) throw profileUpdateError;
      return json({ processed: true, kind: eventType, userId: local.user_id, premium_kept: premiumRemains });
    }

    if (eventType === "invoice.payment_failed" || eventType === "charge.failed") {
      const subCode = data?.subscription?.subscription_code ?? data?.subscription_code;
      if (!subCode) return json({ processed: false, reason: "missing_subscription_code" });
      const { data: local, error } = await admin.from("subscriptions")
        .select("id,user_id,current_period_end")
        .eq("paystack_subscription_code", subCode)
        .maybeSingle();
      if (error) throw error;
      if (!local) return json({ processed: false, reason: "subscription_not_found" });
      await admin.from("subscriptions").update({ status: "attention", updated_at: new Date().toISOString() }).eq("id", local.id);
      const stillCovered = !!local.current_period_end && new Date(local.current_period_end).getTime() > Date.now();
      if (!stillCovered) {
        await admin.from("profiles").update({ is_premium: false, premium_until: null, updated_at: new Date().toISOString() }).eq("user_id", local.user_id);
      }
      return json({ processed: true, kind: eventType, userId: local.user_id });
    }

    if (eventType === "invoice.create" || eventType === "invoice.update") {
      const subCode = data?.subscription?.subscription_code;
      if (!subCode || data?.status !== "success") return json({ processed: false, reason: "not_successful_invoice" });
      const { data: local, error } = await admin.from("subscriptions")
        .select("id,user_id,amount,currency")
        .eq("paystack_subscription_code", subCode)
        .maybeSingle();
      if (error) throw error;
      if (!local) return json({ processed: false, reason: "subscription_not_found" });
      if (data?.amount != null && local.amount != null && Number(data.amount) !== Number(local.amount)) {
        return json({ processed: false, reason: "invoice_amount_mismatch" }, 409);
      }
      const eventCurrency = data?.subscription?.plan?.currency ?? data?.currency;
      if (eventCurrency && local.currency && String(eventCurrency).toUpperCase() !== String(local.currency).toUpperCase()) {
        return json({ processed: false, reason: "invoice_currency_mismatch" }, 409);
      }
      const periodEnd = data?.subscription?.next_payment_date ?? null;
      await admin.from("subscriptions").update({
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
        next_payment_date: periodEnd,
        updated_at: new Date().toISOString(),
      }).eq("id", local.id);
      const applied = await grantPremium({
        userId: local.user_id,
        premiumUntil: periodEnd,
        kind: "invoice.update",
        eventId,
        reference: data?.reference ?? subCode,
        amount: data?.amount ?? null,
        currency: eventCurrency ?? null,
      });
      return json({ processed: true, kind: eventType, userId: local.user_id, duplicate: !applied });
    }

    return json({ processed: false, reason: "unhandled_event" });
  } catch (error) {
    console.error("paystack-process-event error", error);
    return json({ error: "processing_failed" }, 500);
  }
});
