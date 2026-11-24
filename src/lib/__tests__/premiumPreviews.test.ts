import { describe, expect, it } from 'vitest';
import { PREMIUM_PREVIEWS, premiumPreviewState } from '@/lib/premiumPreviews';

describe('premiumPreviewState', () => {
  it('unlocks for a paying Premium member', () => {
    expect(premiumPreviewState({ entitlementLoading: false, isPaidPremium: true })).toBe('unlocked');
  });
  it('locks for anyone without a paid subscription', () => {
    expect(premiumPreviewState({ entitlementLoading: false, isPaidPremium: false })).toBe('locked');
  });
  it('shows neither lock nor unlock while entitlement is loading', () => {
    expect(premiumPreviewState({ entitlementLoading: true, isPaidPremium: false })).toBe('loading');
    expect(premiumPreviewState({ entitlementLoading: true, isPaidPremium: true })).toBe('loading');
  });
  it('only Exclusive Themes links to a Premium-gated page; the rest are informational', () => {
    expect(PREMIUM_PREVIEWS.filter(p => p.route).map(p => [p.id, p.route])).toEqual([
      ['exclusive-themes', '/settings/appearance'],
    ]);
    expect(PREMIUM_PREVIEWS).toHaveLength(6);
  });
});
