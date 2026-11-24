// Security boundary for signed Paystack events.
// Browser-return endpoints never grant entitlements. This dispatcher is used by
// the signed webhook and its retry path to ensure each charge can only affect
// the resource it was created for.
import { createClient } from "npm:@supabase/supabase-js@2";
import { PLANS, getEnvironment, type PlanKey } from "./paystack.ts";
import {
  processEvent as processSubscriptionEvent,
  writeAudit,
  type ProcessResult,
} from "./paystack-processor.ts";

let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) {
    _db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _db;
}

function empty(user: string | null = null): ProcessResult {
  return { user, before: null, after: null };
}

async function processShopCharge(data: any): Promise<ProcessResult> {
  const userId = typeof data?.metadata?.user_id === "string" ? data.metadata.user_id : "";
  const productId = typeof data?.metadata?.product_id === "string" ? data.metadata.product_id : "";
  const reference = typeof data?.reference === "string" ? data.reference : "";
  if (!userId || !productId || !/^htshop_[A-Za-z0-9._-]+$/.test(reference)) {
    console.warn("[paystack] rejected malformed shop charge");
    return empty(userId || null);
  }

  const { data: order, error } = await db().from("shop_orders")
    .select("id,user_id,product_id,status,amount_cents,currency")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (error || !order) {
    console.warn("[paystack] rejected shop charge without staged order", { reference });
    return empty(userId);
  }
  if (
    order.user_id !== userId ||
    order.product_id !== productId ||
    Number(order.amount_cents) !== Number(data?.amount) ||
    String(order.currency ?? "").toUpperCase() !== String(data?.currency ?? "").toUpperCase()
  ) {
    console.warn("[paystack] rejected shop charge integrity mismatch", { reference });
    return empty(userId);
  }

  if (order.status !== "fulfilled") {
    const { error: paidError } = await db().from("shop_orders")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["pending", "paid"]);
    if (paidError) throw paidError;

    const { error: fulfillError } = await db().rpc("fulfill_shop_order", {
      _reference: reference,
    });
    if (fulfillError) throw fulfillError;
  }

  return empty(userId);
}

async function validatePremiumCharge(data: any): Promise<{ ok: true; userId: string } | { ok: false; userId: string | null }> {
  const userId = typeof data?.metadata?.user_id === "string" ? data.metadata.user_id : "";
  const reference = typeof data?.reference === "string" ? data.reference : "";
  const rawPlanKey = data?.metadata?.plan_key;
  if (!userId || !/^htx_[A-Za-z0-9._-]+$/.test(reference) || typeof rawPlanKey !== "string" || !(rawPlanKey in PLANS)) {
    return { ok: false, userId: userId || null };
  }
  const planKey = rawPlanKey as PlanKey;
  const plan = PLANS[planKey];
  if (
    Number(data?.amount) !== plan.amount ||
    String(data?.currency ?? "").toUpperCase() !== plan.currency
  ) {
    console.warn("[paystack] rejected premium charge amount/currency mismatch", { reference });
    return { ok: false, userId };
  }

  const planCode = typeof data?.metadata?.plan_code === "string" ? data.metadata.plan_code : "";
  if (!planCode) return { ok: false, userId };

  const { data: staged } = await db().from("subscriptions")
    .select("id,user_id,plan_code,amount,currency,environment,metadata")
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("environment", getEnvironment())
    .contains("metadata", { payment_reference: reference, kind: "premium_subscription", plan_key: planKey })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    !staged ||
    staged.plan_code !== planCode ||
    Number(staged.amount) !== plan.amount ||
    String(staged.currency ?? "").toUpperCase() !== plan.currency
  ) {
    console.warn("[paystack] rejected premium charge without matching checkout record", { reference });
    return { ok: false, userId };
  }

  return { ok: true, userId };
}

export async function processEvent(eventType: string, data: any, eventId?: string | null): Promise<ProcessResult> {
  if (eventType !== "charge.success") {
    return processSubscriptionEvent(eventType, data, eventId);
  }

  const kind = data?.metadata?.kind;
  if (kind === "shop") {
    return processShopCharge(data);
  }
  if (kind === "premium_subscription") {
    const valid = await validatePremiumCharge(data);
    if (!valid.ok) return empty(valid.userId);
    return processSubscriptionEvent(eventType, data, eventId);
  }

  // Fail closed. A successful charge with an unknown/missing purpose must never
  // unlock Premium or fulfill a shop order.
  console.warn("[paystack] ignored charge.success with unknown payment kind", { kind });
  return empty(typeof data?.metadata?.user_id === "string" ? data.metadata.user_id : null);
}

export { writeAudit };
