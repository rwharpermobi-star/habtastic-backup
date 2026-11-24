import { describe, it, expect, beforeEach, vi } from 'vitest';

// Ads must be inert on web and must default to Google TEST ad units.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));

import { adConfig, TEST_IDS, INTERSTITIAL_COOLDOWN_MS, INTERSTITIAL_DAILY_CAP } from '@/lib/ads/adConfig';
import * as adService from '@/lib/ads/adService';
import { adsSupported, canShowInterstitial, showRewardedAd, maybeShowInterstitial } from '@/lib/ads/adService';

describe('ad config', () => {
  it('falls back to Google test ad units when live ads are not enabled', () => {
    expect(adConfig.isTesting).toBe(true);
    expect(adConfig.appId).toBe(TEST_IDS.appId);
    expect(adConfig.interstitialId).toBe(TEST_IDS.interstitial);
    expect(adConfig.rewardedId).toBe(TEST_IDS.rewarded);
  });
});

describe('ad service on web', () => {
  it('reports ads unsupported and resolves safely instead of throwing', async () => {
    expect(adsSupported()).toBe(false);
    await expect(maybeShowInterstitial()).resolves.toBe(false);
    await expect(showRewardedAd()).resolves.toBe(false);
  });
});

describe('no banner ads', () => {
  it('has no banner API or banner ad unit', () => {
    expect('showBanner' in adService).toBe(false);
    expect('bannerId' in adConfig).toBe(false);
  });
});

describe('interstitial cooldown', () => {
  const day = new Date().toISOString().slice(0, 10);
  beforeEach(() => localStorage.clear());

  it('allows the first interstitial of the day', () => {
    expect(canShowInterstitial({ day, count: 0, last: 0 })).toBe(true);
  });

  it('blocks inside the cooldown window', () => {
    const now = Date.now();
    expect(canShowInterstitial({ day, count: 1, last: now - 1000 }, now)).toBe(false);
  });

  it('allows again after the cooldown window', () => {
    const now = Date.now();
    expect(
      canShowInterstitial({ day, count: 1, last: now - INTERSTITIAL_COOLDOWN_MS - 1 }, now),
    ).toBe(true);
  });

  it('blocks once the daily cap is reached', () => {
    const now = Date.now();
    expect(
      canShowInterstitial({ day, count: INTERSTITIAL_DAILY_CAP, last: 0 }, now),
    ).toBe(false);
  });

  it('uses a 7-minute cooldown and a 15/day cap', () => {
    expect(INTERSTITIAL_COOLDOWN_MS).toBe(7 * 60 * 1000);
    expect(INTERSTITIAL_DAILY_CAP).toBe(15);
  });

  it('still allows the 15th ad but blocks the 16th', () => {
    const now = Date.now();
    expect(canShowInterstitial({ day, count: 14, last: now - INTERSTITIAL_COOLDOWN_MS }, now)).toBe(true);
    expect(canShowInterstitial({ day, count: 15, last: now - INTERSTITIAL_COOLDOWN_MS }, now)).toBe(false);
  });
});
