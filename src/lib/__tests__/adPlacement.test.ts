import { describe, expect, it } from 'vitest';
import { isInterstitialAllowedOnRoute, isPastLaunchGrace, LAUNCH_GRACE_MS } from '@/lib/ads/adPlacement';

describe('full-screen ads never interrupt core actions', () => {
  it.each(['/', '/habits', '/coach', '/pricing', '/checkout/success', '/subscription', '/onboarding', '/auth'])(
    'blocks on %s', (path) => expect(isInterstitialAllowedOnRoute(path)).toBe(false),
  );
  it('allows on a browse screen like Progress', () => {
    expect(isInterstitialAllowedOnRoute('/progress')).toBe(true);
  });
});

describe('no ads on app launch', () => {
  it('waits one minute after the app opens', () => {
    const start = 1_000_000;
    expect(LAUNCH_GRACE_MS).toBe(60_000);
    expect(isPastLaunchGrace(start, start + 59_999)).toBe(false);
    expect(isPastLaunchGrace(start, start + 60_000)).toBe(true);
  });
});
