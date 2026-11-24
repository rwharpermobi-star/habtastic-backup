import { describe, expect, it } from 'vitest';
import { findBlockingSubscription, isBlockingSubscription, playManageUrl } from '@/lib/subscriptionGuard';

const now = new Date('2026-11-18T12:00:00Z');
const future = '2026-12-18T12:00:00Z';
const past = '2026-11-01T12:00:00Z';

describe('one paid subscription per user', () => {
  it('blocks a second purchase while a Google Play subscription is active', () => {
    expect(isBlockingSubscription({ provider: 'google_play', status: 'active', current_period_end: future }, now)).toBe(true);
  });
  it('blocks a second purchase while a website subscription is active', () => {
    expect(isBlockingSubscription({ provider: 'paystack', status: 'active', current_period_end: future }, now)).toBe(true);
  });
  it('blocks while a cancelled subscription still has paid time left', () => {
    expect(isBlockingSubscription({ provider: 'paystack', status: 'non-renewing', current_period_end: future }, now)).toBe(true);
  });
  it('allows buying again after the paid period ended', () => {
    expect(isBlockingSubscription({ provider: 'google_play', status: 'active', current_period_end: past }, now)).toBe(false);
  });
  it('does not block on unfinished or refunded checkouts', () => {
    expect(findBlockingSubscription([
      { provider: 'paystack', status: 'pending', current_period_end: null },
      { provider: 'google_play', status: 'refunded', current_period_end: future },
    ], now)).toBeNull();
  });
  it('links Google Play management to the exact product', () => {
    expect(playManageUrl('habtastic_premium_yearly')).toBe(
      'https://play.google.com/store/account/subscriptions?sku=habtastic_premium_yearly&package=app.lovable.habtastic',
    );
  });
});
