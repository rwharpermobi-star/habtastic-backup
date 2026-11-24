// Google Play subscription lifecycle -> customer + admin email payloads.
//
// Pure helpers (classification, payload building) are separated from the
// network sender so they can be unit-tested without Google or Supabase.
// Emails are best-effort: a send failure must never change entitlement
// processing or the webhook response.

export const PLAY_PACKAGE_NAME = "app.lovable.habtastic";
export const ADMIN_NOTIFICATION_EMAIL = "info@habtastic.com";

export type PlayLifecycleKind =
  | "purchase"
  | "renewal"
  | "payment_failed"
  | "cancellation"
  | "expiration"
  | "refund";

// https://developer.android.com/google/play/billing/rtdn-reference#sub
const SUBSCRIPTION_TYPES: Record<number, { kind: PlayLifecycleKind | null; label: string }> = {
  1: { kind: "renewal", label: "SUBSCRIPTION_RECOVERED" },
  2: { kind: "renewal", label: "SUBSCRIPTION_RENEWED" },
  3: { kind: "cancellation", label: "SUBSCRIPTION_CANCELED" },
  4: { kind: "purchase", label: "SUBSCRIPTION_PURCHASED" },
  5: { kind: "payment_failed", label: "SUBSCRIPTION_ON_HOLD" },
  6: { kind: "payment_failed", label: "SUBSCRIPTION_IN_GRACE_PERIOD" },
  7: { kind: null, label: "SUBSCRIPTION_RESTARTED" },
  8: { kind: null, label: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED" },
  9: { kind: null, label: "SUBSCRIPTION_DEFERRED" },
  10: { kind: null, label: "SUBSCRIPTION_PAUSED" },
  11: { kind: null, label: "SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED" },
  12: { kind: "refund", label: "SUBSCRIPTION_REVOKED" },
  13: { kind: "expiration", label: "SUBSCRIPTION_EXPIRED" },
  19: { kind: null, label: "SUBSCRIPTION_PRICE_CHANGE_UPDATED" },
  20: { kind: null, label: "SUBSCRIPTION_PENDING_PURCHASE_CANCELED" },
};

export interface ClassifiedPlayNotification {
  /** Purchase token to re-verify with Google, or "" when absent. */
  purchaseToken: string;
  /** Email-worthy lifecycle kind, or null when no email should be sent. */
  kind: PlayLifecycleKind | null;
  /** Machine label for logs/metadata. */
  label: string;
  /** Raw RTDN subscription notification type (null for voided purchases). */
  notificationType: number | null;
  /** Google order id when the notification carries one (voided purchases). */
  orderId: string | null;
  eventTimeMillis: string | null;
  /** Voided purchases only: 1 = full refund, 2 = quantity-based partial refund. */
  refundType: number | null;
  /** True when this RTDN is not about subscriptions at all. */
  unsupported: boolean;
}

export function classifyPlayNotification(event: Record<string, unknown>): ClassifiedPlayNotification {
  const eventTimeMillis = typeof event.eventTimeMillis === "string" ? event.eventTimeMillis : null;
  const sub = event.subscriptionNotification as Record<string, unknown> | undefined;
  if (sub && typeof sub === "object") {
    const type = Number(sub.notificationType);
    const mapped = SUBSCRIPTION_TYPES[type];
    return {
      purchaseToken: typeof sub.purchaseToken === "string" ? sub.purchaseToken.trim() : "",
      kind: mapped?.kind ?? null,
      label: mapped?.label ?? `SUBSCRIPTION_TYPE_${Number.isFinite(type) ? type : "UNKNOWN"}`,
      notificationType: Number.isFinite(type) ? type : null,
      orderId: null,
      eventTimeMillis,
      refundType: null,
      unsupported: false,
    };
  }

  const voided = event.voidedPurchaseNotification as Record<string, unknown> | undefined;
  // productType 1 = subscription. One-time product refunds are not ours.
  if (voided && typeof voided === "object" && Number(voided.productType) === 1) {
    return {
      purchaseToken: typeof voided.purchaseToken === "string" ? voided.purchaseToken.trim() : "",
      kind: "refund",
      label: "VOIDED_PURCHASE",
      notificationType: null,
      orderId: typeof voided.orderId === "string" ? voided.orderId : null,
      eventTimeMillis,
      refundType: Number.isFinite(Number(voided.refundType)) ? Number(voided.refundType) : null,
      unsupported: false,
    };
  }

  return {
    purchaseToken: "",
    kind: null,
    label: event.testNotification ? "TEST" : "UNSUPPORTED",
    notificationType: null,
    orderId: null,
    eventTimeMillis,
    refundType: null,
    unsupported: !event.testNotification,
  };
}

export type RevocationReason = "refund" | "chargeback" | "revoked";

export interface RevocationDecision {
  revoke: boolean;
  orderId: string | null;
  reason: RevocationReason | null;
  /** Why the decision was made, for logs. */
  why: string;
}

/** Google order ids for renewals append "..N" to the original order id. */
export function sameOrder(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim() === b.trim();
}

/**
 * Decides whether a refund-type notification must remove Premium now.
 *
 * - SUBSCRIPTION_REVOKED: Google already ended access (refund + revoke) -> remove now.
 * - Voided purchase (refund or chargeback) of the current paid order -> remove now.
 * - Voided purchase when Google no longer reports an entitlement -> remove now.
 * - Voided OLDER renewal while the current period is paid -> keep access to period end.
 * - Quantity-based partial refund -> keep access.
 */
export function decidePlayRevocation(input: {
  notification: Pick<ClassifiedPlayNotification, "kind" | "label" | "orderId" | "refundType">;
  latestOrderId: string | null;
  googleEntitled: boolean;
  voidedReason?: number | null;
}): RevocationDecision {
  const { notification, latestOrderId, googleEntitled } = input;
  if (notification.kind !== "refund") return { revoke: false, orderId: null, reason: null, why: "not_a_refund" };

  if (notification.label === "SUBSCRIPTION_REVOKED") {
    return { revoke: true, orderId: latestOrderId || "unknown", reason: "revoked", why: "google_revoked" };
  }

  if (notification.refundType === 2) {
    return { revoke: false, orderId: notification.orderId, reason: null, why: "partial_refund" };
  }

  const reason: RevocationReason = input.voidedReason === 7 ? "chargeback" : "refund";
  const orderId = notification.orderId || latestOrderId || "unknown";
  if (!googleEntitled) return { revoke: true, orderId, reason, why: "no_google_entitlement" };
  if (!notification.orderId || !latestOrderId || sameOrder(notification.orderId, latestOrderId)) {
    return { revoke: true, orderId, reason, why: "current_order_voided" };
  }
  return { revoke: false, orderId, reason, why: "older_order_voided_current_period_paid" };
}

/**
 * Best-effort lookup of why Google voided an order (7 = chargeback). Needs the
 * service account's "View financial data" permission; returns null on any error.
 */
export async function lookupVoidedReason(opts: {
  accessToken: string;
  purchaseToken: string;
  orderId: string | null;
  eventTimeMillis: string | null;
}): Promise<number | null> {
  try {
    const eventMs = Number(opts.eventTimeMillis) || Date.now();
    const startTime = Math.max(0, eventMs - 24 * 60 * 60 * 1000);
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE_NAME}` +
      `/purchases/voidedpurchases?type=1&startTime=${startTime}&maxResults=1000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.accessToken}` },
      signal: AbortSignal.timeout(4_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body?.voidedPurchases)) return null;
    // deno-lint-ignore no-explicit-any
    const match = body.voidedPurchases.find((v: any) =>
      (opts.orderId && v?.orderId === opts.orderId) || v?.purchaseToken === opts.purchaseToken
    );
    const reason = Number(match?.voidedReason);
    return Number.isFinite(reason) ? reason : null;
  } catch {
    return null;
  }
}

/** Converts a Google Money ({units, nanos}) into "94.99". */
export function formatPlayMoney(units: unknown, nanos: unknown): string | null {
  const whole = Number(units ?? 0);
  const frac = Number(nanos ?? 0);
  if (!Number.isFinite(whole) || !Number.isFinite(frac)) return null;
  if (whole === 0 && frac === 0) return null;
  return (whole + frac / 1e9).toFixed(2);
}

export function formatEmailDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" });
}

export function playManageUrl(productId: string): string {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${PLAY_PACKAGE_NAME}`;
}

async function shortHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface LifecycleEmailInput {
  kind: PlayLifecycleKind;
  notificationType: number | null;
  purchaseToken: string;
  userId: string;
  productId: string;
  interval: string; // "monthly" | "annually"
  amount: string | null; // "94.99"
  currency: string | null;
  periodEnd: string | null; // ISO
  orderId: string | null;
  eventTimeMillis: string | null;
  /** Refunds only: what happened to Premium and why. */
  refundReason?: RevocationReason | null;
  premiumRemoved?: boolean;
}

export interface EmailRequest {
  templateName: string;
  recipientEmail?: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

/**
 * Builds a stable idempotency suffix so Pub/Sub redeliveries (and the paired
 * REVOKED + VOIDED notifications Google sends for one refund) send once.
 */
export async function lifecycleDedupeKey(input: LifecycleEmailInput): Promise<string> {
  const token = await shortHash(input.purchaseToken);
  switch (input.kind) {
    case "purchase":
      return `purchase-${token}`;
    case "renewal":
      return `renewal-${token}-${input.periodEnd ?? input.eventTimeMillis ?? "na"}`;
    case "payment_failed":
      return `payfail-${token}-${input.notificationType ?? "na"}-${input.periodEnd ?? input.eventTimeMillis ?? "na"}`;
    case "cancellation":
      return `cancel-${token}-${input.periodEnd ?? input.eventTimeMillis ?? "na"}`;
    case "expiration":
      return `expired-${token}-${input.periodEnd ?? "na"}`;
    case "refund":
      return `refund-${token}-${input.orderId ?? "na"}`;
  }
}

export async function buildLifecycleEmails(
  input: LifecycleEmailInput,
  customerEmail: string | null,
): Promise<EmailRequest[]> {
  const key = await lifecycleDedupeKey(input);
  const planName = input.interval === "annually" ? "Premium Yearly" : "Premium Monthly";
  const currency = (input.currency || "ZAR").toUpperCase();
  const periodEnd = formatEmailDate(input.periodEnd);
  const accessPaused = input.kind === "payment_failed" && input.notificationType === 5;

  const out: EmailRequest[] = [];
  if (customerEmail) {
    out.push({
      templateName: "subscription-lifecycle",
      recipientEmail: customerEmail,
      idempotencyKey: `gplay-customer-${key}`,
      templateData: {
        kind: input.kind,
        planName,
        amount: input.amount,
        currency,
        periodEnd,
        accessPaused,
        refundReason: input.refundReason ?? null,
        premiumRemoved: input.premiumRemoved ?? false,
        manageUrl: playManageUrl(input.productId),
      },
    });
  }

  // Admin copy: no customer email/name — only an account reference and the
  // Google order id needed to look the purchase up in Play Console.
  out.push({
    templateName: "admin-subscription-alert",
    idempotencyKey: `gplay-admin-${key}`,
    templateData: {
      kind: input.kind,
      provider: "Google Play",
      planName,
      amount: input.amount,
      currency,
      periodEnd,
      accessPaused,
      refundReason: input.refundReason ?? null,
      premiumRemoved: input.premiumRemoved ?? false,
      accountRef: input.userId.slice(0, 8),
      orderId: input.orderId,
      occurredAt: formatEmailDate(
        input.eventTimeMillis ? new Date(Number(input.eventTimeMillis)).toISOString() : new Date().toISOString(),
      ),
    },
  });
  return out;
}

/** Enqueues the emails through send-transactional-email. Never throws. */
export async function sendLifecycleEmails(
  requests: EmailRequest[],
  env: { supabaseUrl: string; serviceRoleKey: string },
): Promise<void> {
  for (const body of requests) {
    try {
      const res = await fetch(`${env.supabaseUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.serviceRoleKey}`,
          apikey: env.serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        console.warn("[google-play-email] enqueue failed", { template: body.templateName, status: res.status });
      }
    } catch (error) {
      console.warn("[google-play-email] enqueue threw", { template: body.templateName, error: String(error) });
    }
  }
}
