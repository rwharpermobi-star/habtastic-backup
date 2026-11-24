import { supabase } from '@/integrations/supabase/client';

/**
 * Cross-provider subscription rules. A user may hold only ONE paid
 * subscription at a time, whether it came from Google Play or the website.
 * Mirrored server-side in `supabase/functions/_shared/subscriptionGuard.ts`.
 */
export type SubscriptionProvider = 'google_play' | 'paystack';

export interface SubscriptionLike {
  provider: string | null;
  status: string | null;
  plan_code?: string | null;
  plan_interval?: string | null;
  current_period_end: string | null;
}

export const BLOCKING_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'non-renewing', 'attention'] as const;

export const PLAY_PACKAGE_NAME = 'app.lovable.habtastic';

/** True when this row is a live paid subscription that must block another purchase. */
export function isBlockingSubscription(sub: SubscriptionLike | null | undefined, now: Date = new Date()): boolean {
  if (!sub?.status) return false;
  if (!(BLOCKING_SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) return false;
  if (!sub.current_period_end) return ['active', 'attention', 'non-renewing'].includes(sub.status);
  const end = Date.parse(sub.current_period_end);
  return Number.isFinite(end) && end > now.getTime();
}

export function findBlockingSubscription<T extends SubscriptionLike>(rows: T[] | null | undefined, now: Date = new Date()): T | null {
  return (rows ?? []).find((r) => isBlockingSubscription(r, now)) ?? null;
}

export function providerLabel(provider: string | null | undefined): string {
  return provider === 'google_play' ? 'Google Play' : 'the HabTastic website';
}

export function alreadySubscribedMessage(provider: string | null | undefined): string {
  return `You already have Premium through ${providerLabel(provider)}. Manage it from Subscription in your profile.`;
}

/** Google Play subscription page for a specific product (falls back to the app's list). */
export function playManageUrl(productId?: string | null): string {
  const pkg = `package=${PLAY_PACKAGE_NAME}`;
  return productId
    ? `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&${pkg}`
    : `https://play.google.com/store/account/subscriptions?${pkg}`;
}

/** Fresh read (never cached) used right before starting any purchase. */
export async function fetchBlockingSubscription(userId: string): Promise<SubscriptionLike | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('provider, status, plan_code, plan_interval, current_period_end')
    .eq('user_id', userId)
    .in('status', [...BLOCKING_SUBSCRIPTION_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return findBlockingSubscription(data as SubscriptionLike[]);
}
