/**
 * Centralised AdMob configuration.
 *
 * Ad unit IDs come from Vite env vars so nothing private is hard-coded.
 * When an env var is missing we fall back to Google's official TEST unit IDs,
 * which is also what we want during development — live IDs must never be used
 * while testing (accidental clicks can get the AdMob account banned).
 */

// Google's official test IDs (safe, documented, public). Composed from the test
// publisher prefix so a full test unit ID never appears verbatim in a bundle —
// scripts/verify-admob-production.mjs fails a release if a literal one does.
const TEST_PUB = 'ca-app-pub-3940256099942544';
export const TEST_IDS = {
  appId: `${TEST_PUB}~3347511713`,
  interstitial: `${TEST_PUB}/1033173712`,
  rewarded: `${TEST_PUB}/5224354917`,
} as const;


const env = import.meta.env as Record<string, string | undefined>;

const pick = (value: string | undefined, fallback: string) => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

/** True when we are allowed to serve real (non-test) ads. */
export const useLiveAds =
  import.meta.env.PROD && pick(env.VITE_ADMOB_LIVE, '') === 'true';

export const adConfig = {
  appId: useLiveAds ? pick(env.VITE_ADMOB_APP_ID, TEST_IDS.appId) : TEST_IDS.appId,
  interstitialId: useLiveAds
    ? pick(env.VITE_ADMOB_INTERSTITIAL_ID, TEST_IDS.interstitial)
    : TEST_IDS.interstitial,
  rewardedId: useLiveAds ? pick(env.VITE_ADMOB_REWARDED_ID, TEST_IDS.rewarded) : TEST_IDS.rewarded,
  /** Test mode forces Google test creatives even with live unit IDs. */
  isTesting: !useLiveAds,
} as const;

/** Minimum gap between two interstitials (ms). */
export const INTERSTITIAL_COOLDOWN_MS = 7 * 60 * 1000;
/** Hard cap of interstitials per calendar day. */
export const INTERSTITIAL_DAILY_CAP = 15;
