// Display helpers for a saved subscription's billing interval.
// The server stores Google Play and Paystack yearly plans as "annually", but
// older rows and other sources may use "yearly", "annual" or "year".
// Display only: prices and the purchase flow never read these.

export type PlanIntervalKind = 'yearly' | 'monthly' | 'one_time' | 'unknown';

export function normalizePlanInterval(interval: string | null | undefined): PlanIntervalKind {
  const v = (interval ?? '').trim().toLowerCase();
  if (['annually', 'yearly', 'annual', 'year', 'p1y'].includes(v)) return 'yearly';
  if (['monthly', 'month', 'p1m'].includes(v)) return 'monthly';
  if (['one_time', 'lifetime'].includes(v)) return 'one_time';
  return 'unknown';
}

export function planLabelFor(interval: string | null | undefined): string {
  switch (normalizePlanInterval(interval)) {
    case 'yearly': return 'Yearly Plan';
    case 'monthly': return 'Monthly Plan';
    case 'one_time': return 'Lifetime';
    default: return 'Premium Plan';
  }
}

export function intervalSuffixFor(interval: string | null | undefined): string {
  switch (normalizePlanInterval(interval)) {
    case 'yearly': return '/yr';
    case 'monthly': return '/mo';
    default: return '';
  }
}

export function shortPlanNameFor(interval: string | null | undefined): string {
  switch (normalizePlanInterval(interval)) {
    case 'yearly': return 'Yearly';
    case 'monthly': return 'Monthly';
    case 'one_time': return 'Lifetime';
    default: return interval ?? '';
  }
}
