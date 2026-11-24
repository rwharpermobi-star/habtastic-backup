// Server mirror of src/lib/subscriptionGuard.ts. One paid subscription per user.
export const BLOCKING_SUBSCRIPTION_STATUSES = ["active", "trialing", "non-renewing", "attention"];

export interface SubscriptionLike {
  provider: string | null;
  status: string | null;
  current_period_end: string | null;
}

export function isBlockingSubscription(sub: SubscriptionLike | null | undefined, now: Date = new Date()): boolean {
  if (!sub?.status || !BLOCKING_SUBSCRIPTION_STATUSES.includes(sub.status)) return false;
  if (!sub.current_period_end) return ["active", "attention", "non-renewing"].includes(sub.status);
  const end = Date.parse(sub.current_period_end);
  return Number.isFinite(end) && end > now.getTime();
}

export function findBlockingSubscription<T extends SubscriptionLike>(rows: T[] | null | undefined, now: Date = new Date()): T | null {
  return (rows ?? []).find((r) => isBlockingSubscription(r, now)) ?? null;
}
