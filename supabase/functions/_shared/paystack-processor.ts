// Shared subscription state-transition handlers used by both the live
// webhook and the manual retry path. Pure server-side (Deno).
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEnvironment } from "./paystack.ts";

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

export const TRACKED_FIELDS = [
  "status","plan_interval","plan_code","amount","currency",
  "current_period_start","current_period_end","next_payment_date",
  "cancel_at_period_end","canceled_at","paystack_customer_code",
  "paystack_subscription_code","environment",
] as const;

export function diffSub(before: any, after: any): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  if (!after) return out;
  for (const f of TRACKED_FIELDS) {
    const a = before?.[f] ?? null, b = after?.[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[f] = { old: a, new: b };
  }
  return out;
}

async function snapshotSub(userId: string | null, subCode?: string | null) {
  if (!userId && !subCode) return null;
  const q = db().from("subscriptions").select("*");
  const { data } = subCode
    ? await q.eq("paystack_subscription_code", subCode).maybeSingle()
    : await q.eq("user_id", userId!).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function syncProfile(userId: string, premium: boolean, until: string | null) {
  const { data, error } = await db().from("profiles").update({
    is_premium: premium,
    premium_until: until,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).select("user_id").maybeSingle();

  if (error) {
    throw new Error(`Failed to sync Premium profile: ${error.message}`);
  }
  if (!data) {
    throw new Error("Failed to sync Premium profile: profile not found");
  }
}

// Insert an in-app notification row. Best-effort — never throws.
async function notify(
  userId: string,
  kind: string,
  title: string,
  body: string,
  payload: Record<string, unknown> = {},
) {
  try {
    await db().from("notifications").insert({
      user_id: userId,
      kind,
      title,
      body,
      payload,
    });
  } catch (e) {
    console.warn("[paystack] notify insert failed", e);
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  catch { return ""; }
}

function formatMinorUnitAmount(value: unknown): string | null {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return (amount / 100).toFixed(2);
}

function receiptPlanName(interval: unknown): string {
  const value = typeof interval === "string" ? interval.toLowerCase() : "";
  if (value.includes("year") || value.includes("annual")) return "Premium Yearly";
  if (value.includes("month")) return "Premium Monthly";
  return "Premium";
}

// Best-effort transactional receipt. It is called only after the authoritative
// payment mutation succeeds, and every caller supplies a stable billing-event
// key so Paystack redeliveries cannot enqueue duplicates.
export async function enqueuePaymentReceipt(opts: {
  userId: string;
  reference: string | null;
  idempotencyReference?: string | null;
  amount: unknown;
  currency: unknown;
  paidAt?: string | null;
  nextBillingDate?: string | null;
  planInterval?: unknown;
}): Promise<void> {
  const reference = opts.reference?.trim();
  const amount = formatMinorUnitAmount(opts.amount);
  if (!reference || !amount) {
    console.warn("[paystack] receipt skipped: payment reference or amount missing");
    return;
  }

  try {
    const { data: authUser, error: userError } = await db().auth.admin.getUserById(opts.userId);
    const recipientEmail = authUser?.user?.email?.trim().toLowerCase();
    if (userError || !recipientEmail) {
      console.warn("[paystack] receipt skipped: account email unavailable", {
        userId: opts.userId,
        error: userError?.message,
      });
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("[paystack] receipt skipped: backend email credentials unavailable");
      return;
    }

    const paidAt = fmtDate(opts.paidAt ?? new Date().toISOString());
    const nextBillingDate = fmtDate(opts.nextBillingDate ?? null) || undefined;
    const currency = typeof opts.currency === "string" && opts.currency.trim()
      ? opts.currency.trim().toUpperCase()
      : "ZAR";
    const dedupeReference = opts.idempotencyReference?.trim() || reference;

    const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: "payment-receipt",
        recipientEmail,
        idempotencyKey: `payment-receipt-${dedupeReference}`,
        templateData: {
          planName: receiptPlanName(opts.planInterval),
          amount,
          currency,
          reference,
          paidAt,
          nextBillingDate,
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      console.warn("[paystack] receipt enqueue failed", {
        status: response.status,
        reference,
      });
    }
  } catch (error) {
    // A receipt failure must never roll back or misreport a confirmed payment.
    console.warn("[paystack] receipt enqueue threw", { reference, error });
  }
}

// Idempotent premium grant. Records the grant keyed on paystack_event_id
// (or reference+kind as a fallback) via `premium_grants` UNIQUE indexes,
// so duplicate webhook deliveries cannot extend premium twice. Returns
// `true` if the grant was applied, `false` if it was a duplicate.
async function grantPremium(opts: {
  userId: string;
  premiumUntil: string | null;
  kind: string;
  eventId?: string | null;
  reference?: string | null;
  amount?: number | null;
  currency?: string | null;
}): Promise<boolean> {
  const { data: applied, error } = await db().rpc("apply_paystack_premium_grant", {
    _user_id: opts.userId,
    _event_id: opts.eventId ?? null,
    _reference: opts.reference ?? null,
    _kind: opts.kind,
    _premium_until: opts.premiumUntil,
    _amount: opts.amount ?? null,
    _currency: opts.currency ?? null,
  });
  if (error) {
    console.error("[paystack] atomic Premium grant failed", {
      userId: opts.userId,
      eventId: opts.eventId ?? null,
      code: (error as { code?: string }).code,
      message: error.message,
    });
    throw new Error(`Failed to apply Premium grant: ${error.message}`);
  }
  return applied === true;
}

// Referral rewards are only granted for server-verified paid subscribers.
// The SQL function is idempotent (one qualification per invited account) and
// applies self-referral / pre-existing-premium fraud checks.
async function qualifyReferral(userId: string, reference: string | null) {
  try {
    const { data, error } = await db().rpc("qualify_referral_payment", {
      _referred_id: userId,
      _reference: reference,
      _provider: "paystack",
      _environment: getEnvironment(),
    });
    if (error) console.warn("[paystack] referral qualification failed", error);
    else console.log("[paystack] referral qualification", data);
  } catch (e) {
    console.warn("[paystack] referral qualification threw", e);
  }
}

async function findUserIdByCustomer(customerCode: string | undefined): Promise<string | null> {

  if (!customerCode) return null;
  const { data } = await db().from("subscriptions").select("user_id")
    .eq("paystack_customer_code", customerCode).limit(1).maybeSingle();
  return (data?.user_id as string) ?? null;
}

export type ProcessResult = { user: string | null; before: any; after: any };

export async function processEvent(eventType: string, data: any, eventId?: string | null): Promise<ProcessResult> {
  switch (eventType) {
    case "charge.success": {
      const userId = data?.metadata?.user_id;
      if (!userId) return { user: null, before: null, after: null };
      const planKey = data?.metadata?.plan_key;
      const before = await snapshotSub(userId);
      const reference = data?.reference ?? null;
      const applied = await grantPremium({
        userId,
        premiumUntil: null,
        kind: "charge.success",
        eventId: eventId ? String(eventId) : null,
        reference,
        amount: data?.amount ?? null,
        currency: data?.currency ?? null,
      });
      if (applied) {
        await db().from("subscriptions").update({
          paystack_customer_code: data?.customer?.customer_code,
          paystack_customer_id: data?.customer?.id,
          amount: data?.amount,
          currency: data?.currency,
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId).eq("status", "pending");
        await notify(
          userId,
          "premium",
          "Premium activated 🎉",
          "Your payment succeeded and Premium is now unlocked. Enjoy unlimited habits, Winston AI, and more.",
          { event: "charge.success", reference },
        );
        await qualifyReferral(userId, reference);
        await enqueuePaymentReceipt({
          userId,
          reference,
          amount: data?.amount,
          currency: data?.currency,
          paidAt: data?.paid_at ?? data?.paidAt ?? null,
          planInterval: data?.plan_object?.interval ?? planKey,
        });
      }

      return { user: userId, before, after: await snapshotSub(userId) };
    }
    case "subscription.create": {
      const customerCode = data?.customer?.customer_code;
      const userId = await findUserIdByCustomer(customerCode);
      if (!userId) return { user: null, before: null, after: null };
      const before = await snapshotSub(userId);
      const periodEnd = data?.next_payment_date ?? null;
      await db().from("subscriptions").upsert({
        user_id: userId,
        paystack_customer_code: customerCode,
        paystack_customer_id: data?.customer?.id,
        paystack_subscription_code: data?.subscription_code,
        paystack_subscription_id: data?.id,
        email_token: data?.email_token,
        plan_code: data?.plan?.plan_code,
        plan_interval: data?.plan?.interval,
        status: data?.status || "active",
        amount: data?.amount,
        currency: data?.plan?.currency,
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
        next_payment_date: periodEnd,
        cancel_at_period_end: false,
        environment: getEnvironment(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "paystack_subscription_code" });
      await grantPremium({
        userId,
        premiumUntil: periodEnd,
        kind: "subscription.create",
        eventId: eventId ? String(eventId) : null,
        reference: data?.subscription_code ?? null,
        amount: data?.amount ?? null,
        currency: data?.plan?.currency ?? null,
      });
      await notify(
        userId,
        "premium",
        "Subscription active ✨",
        periodEnd
          ? `You're all set. Next renewal on ${fmtDate(periodEnd)}.`
          : "Your Premium subscription is now active.",
        { event: "subscription.create", periodEnd, plan: data?.plan?.plan_code },
      );
      await qualifyReferral(userId, data?.subscription_code ?? null);
      return { user: userId, before, after: await snapshotSub(userId) };

    }
    case "subscription.disable":
    case "subscription.not_renew": {
      const subCode = data?.subscription_code;
      if (!subCode) return { user: null, before: null, after: null };
      const before = await snapshotSub(null, subCode);
      await db().from("subscriptions").update({
        status: "canceled",
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("paystack_subscription_code", subCode);
      const after = await snapshotSub(null, subCode);
      if (after?.user_id) {
        const periodEnd = (after.current_period_end as string) ?? null;
        const stillActive = !!periodEnd && new Date(periodEnd) > new Date();
        await syncProfile(after.user_id as string, stillActive, periodEnd);
        if (stillActive) {
          await notify(
            after.user_id as string,
            "premium",
            "Subscription canceled",
            `Your Premium plan won't renew. You'll keep access until ${fmtDate(periodEnd)}.`,
            { event: eventType, periodEnd },
          );
        } else {
          await notify(
            after.user_id as string,
            "premium",
            "Premium ended",
            "Your Premium plan has ended. Resubscribe anytime to unlock everything again.",
            { event: eventType },
          );
        }
      }
      return { user: (after?.user_id as string) ?? null, before, after };
    }
    case "invoice.payment_failed":
    case "charge.failed": {
      // Paystack uses `charge.failed` for one-off failed charges and
      // `invoice.payment_failed` for failed subscription renewals. Both mark
      // the subscription as needing attention so we surface a payment issue.
      // We do NOT revoke premium immediately — the user keeps benefits until
      // `current_period_end` passes, which is the industry-standard dunning
      // grace window and lets Paystack auto-retry the charge.
      const subCode = data?.subscription?.subscription_code ?? data?.subscription_code;
      if (!subCode) return { user: null, before: null, after: null };
      const before = await snapshotSub(null, subCode);
      await db().from("subscriptions").update({
        status: "attention",
        updated_at: new Date().toISOString(),
      }).eq("paystack_subscription_code", subCode);
      const after = await snapshotSub(null, subCode);
      // If the grace window has already elapsed, downgrade immediately.
      if (after?.user_id) {
        const periodEnd = after.current_period_end as string | null;
        const stillCovered = !!periodEnd && new Date(periodEnd) > new Date();
        if (!stillCovered) {
          await syncProfile(after.user_id as string, false, null);
          await notify(
            after.user_id as string,
            "premium",
            "Premium paused — payment failed",
            "We couldn't process your renewal. Update your payment method to restore Premium.",
            { event: eventType },
          );
        } else {
          await notify(
            after.user_id as string,
            "premium",
            "Payment issue on your subscription",
            `Your last payment failed. We'll retry automatically — Premium stays active until ${fmtDate(periodEnd)}.`,
            { event: eventType, periodEnd },
          );
        }
      }
      return { user: (after?.user_id as string) ?? null, before, after };
    }
    case "invoice.create":
    case "invoice.update": {
      const subCode = data?.subscription?.subscription_code;
      if (!subCode || data?.status !== "success") return { user: null, before: null, after: null };
      const before = await snapshotSub(null, subCode);
      const periodEnd = data?.subscription?.next_payment_date ?? null;
      await db().from("subscriptions").update({
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
        next_payment_date: periodEnd,
        updated_at: new Date().toISOString(),
      }).eq("paystack_subscription_code", subCode);
      const after = await snapshotSub(null, subCode);
      if (after?.user_id) {
        const applied = await grantPremium({
          userId: after.user_id as string,
          premiumUntil: periodEnd,
          kind: "invoice.update",
          eventId: eventId ? String(eventId) : null,
          reference: data?.reference ?? subCode,
          amount: data?.amount ?? null,
          currency: data?.subscription?.plan?.currency ?? null,
        });
        if (applied) {
          const wasCovered = !!before?.current_period_end &&
            new Date(before.current_period_end as string) > new Date();
          await notify(
            after.user_id as string,
            "premium",
            wasCovered ? "Premium renewed ✅" : "Premium restored",
            periodEnd
              ? `Payment received. Your next renewal is ${fmtDate(periodEnd)}.`
              : "Payment received. Premium is active.",
            { event: eventType, periodEnd },
          );
          await enqueuePaymentReceipt({
            userId: after.user_id as string,
            reference: data?.reference ?? subCode,
            idempotencyReference: `${subCode}-${periodEnd ?? data?.reference ?? eventId ?? "payment"}`,
            amount: data?.amount,
            currency: data?.subscription?.plan?.currency ?? after.currency,
            paidAt: data?.paid_at ?? data?.paidAt ?? null,
            nextBillingDate: periodEnd,
            planInterval: data?.subscription?.plan?.interval ?? after.plan_interval,
          });
        }
      }
      return { user: (after?.user_id as string) ?? null, before, after };
    }
    default:
      console.log("Unhandled event:", eventType);
      return { user: null, before: null, after: null };
  }
}

export async function writeAudit(
  eventId: string | null,
  eventType: string,
  userId: string | null,
  before: any,
  after: any,
  extra?: Record<string, unknown>,
) {
  const changed = diffSub(before, after);
  if (Object.keys(changed).length === 0) return changed;
  await db().from("paystack_subscription_audit").insert({
    event_id: eventId,
    event_type: eventType,
    user_id: userId,
    changed_fields: { ...changed, ...(extra ?? {}) },
  });
  return changed;
}

// Unconditional audit row — used by the manual sync flow so every attempt
// is visible in the in-app debugger, even when it produced no state change.
export async function writeSyncAudit(
  userId: string,
  outcome: string,
  extra: Record<string, unknown> = {},
) {
  await db().from("paystack_subscription_audit").insert({
    event_id: null,
    event_type: "manual_sync",
    user_id: userId,
    changed_fields: { outcome, ...extra },
  });
}
