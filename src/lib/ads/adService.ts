/**
 * Centralised AdMob service.
 *
 * Every ad interaction in the app goes through this module — no ad SDK calls
 * anywhere else. It is deliberately fail-safe: on web, when the plugin is
 * missing, offline, or when AdMob errors/no-fills, every method resolves
 * quietly so ads can never block or crash the app.
 */
import { Capacitor } from '@capacitor/core';
import { logWarn } from '@/lib/logger';
import {
  adConfig,
  INTERSTITIAL_COOLDOWN_MS,
  INTERSTITIAL_DAILY_CAP,
} from './adConfig';
import { isInterstitialAllowedOnRoute, isPastLaunchGrace } from './adPlacement';

type AnyAdMob = any;

const COOLDOWN_KEY = 'admob-interstitial-state';
const APP_STARTED_AT = Date.now();

let pluginPromise: Promise<AnyAdMob | null> | null = null;
let initialized = false;
let initializing: Promise<boolean> | null = null;
let interstitialInFlight = false;

/** Ads only ever run inside the native Android/iOS shell. */
export const adsSupported = () => Capacitor.isNativePlatform();

/** True when a full-screen ad would interrupt the user right now. */
function wouldInterruptUser(): boolean {
  if (typeof window === 'undefined') return true;
  if (document.visibilityState !== 'visible') return true; // app closing / backgrounded
  if (!isPastLaunchGrace(APP_STARTED_AT)) return true; // no ads on launch
  if (!isInterstitialAllowedOnRoute(window.location.pathname)) return true;
  // Any open dialog, sheet or paywall is an action in progress.
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

async function loadPlugin(): Promise<AnyAdMob | null> {
  if (!adsSupported()) return null;
  if (!pluginPromise) {
    pluginPromise = import('@capacitor-community/admob')
      .then((m) => m as AnyAdMob)
      .catch((err) => {
        logWarn('app', '[ads] plugin unavailable', { err: String(err) });
        return null;
      });
  }
  return pluginPromise;
}

/** Ask for UMP/GDPR consent when required. Never throws. */
async function requestConsent(mod: AnyAdMob) {
  try {
    const info = await mod.AdMob.requestConsentInfo();
    if (info?.isConsentFormAvailable && info?.status === 'REQUIRED') {
      await mod.AdMob.showConsentForm();
    }
  } catch (err) {
    logWarn('app', '[ads] consent flow skipped', { err: String(err) });
  }
}

/** Idempotent SDK init + consent. Resolves false when ads are unavailable. */
export async function initAds(): Promise<boolean> {
  if (initialized) return true;
  if (initializing) return initializing;

  initializing = (async () => {
    const mod = await loadPlugin();
    if (!mod) return false;
    try {
      await mod.AdMob.initialize({
        initializeForTesting: adConfig.isTesting,
        tagForChildDirectedTreatment: false,
      });
      await requestConsent(mod);
      initialized = true;
      return true;
    } catch (err) {
      logWarn('app', '[ads] initialize failed', { err: String(err) });
      return false;
    } finally {
      initializing = null;
    }
  })();

  return initializing;
}

/** Open Google's UMP privacy-options form so consent can be withdrawn later. */
export async function showAdsPrivacyOptions(): Promise<boolean> {
  const mod = await loadPlugin();
  if (!mod || !(await initAds())) return false;
  try {
    const info = await mod.AdMob.requestConsentInfo();
    if (info?.privacyOptionsRequirementStatus !== 'REQUIRED') return false;
    await mod.AdMob.showPrivacyOptionsForm();
    return true;
  } catch (err) {
    logWarn('app', '[ads] privacy options unavailable', { err: String(err) });
    return false;
  }
}

/* ── Interstitial ───────────────────────────────────────────────────────── */

type CooldownState = { day: string; count: number; last: number };

const today = () => new Date().toISOString().slice(0, 10);

export function readInterstitialState(): CooldownState {
  try {
    const raw = localStorage.getItem(COOLDOWN_KEY);
    const parsed = raw ? (JSON.parse(raw) as CooldownState) : null;
    if (parsed && parsed.day === today()) return parsed;
  } catch {
    /* ignore corrupt state */
  }
  return { day: today(), count: 0, last: 0 };
}

/** Pure cooldown check — exported for tests. */
export function canShowInterstitial(state = readInterstitialState(), now = Date.now()): boolean {
  if (state.day !== today()) return true;
  if (state.count >= INTERSTITIAL_DAILY_CAP) return false;
  return now - state.last >= INTERSTITIAL_COOLDOWN_MS;
}

function markInterstitialShown() {
  const state = readInterstitialState();
  try {
    localStorage.setItem(
      COOLDOWN_KEY,
      JSON.stringify({ day: today(), count: state.count + 1, last: Date.now() }),
    );
  } catch {
    /* storage full / disabled — cooldown just resets, never fatal */
  }
}

/**
 * Show an interstitial at a natural break (a tab change), subject to the
 * placement rules, cooldown and daily cap. Google's own full-screen ad UI
 * always includes its close button.
 * Returns true only when an ad was actually displayed.
 */
export async function maybeShowInterstitial(): Promise<boolean> {
  if (wouldInterruptUser()) return false;
  if (interstitialInFlight) return false;
  if (!canShowInterstitial()) return false;
  const mod = await loadPlugin();
  if (!mod || !(await initAds())) return false;
  // Re-check: the user may have opened something while the SDK loaded.
  if (wouldInterruptUser()) return false;

  interstitialInFlight = true;
  try {
    await mod.AdMob.prepareInterstitial({
      adId: adConfig.interstitialId,
      isTesting: adConfig.isTesting,
    });
    if (wouldInterruptUser()) return false;
    await mod.AdMob.showInterstitial();
    markInterstitialShown();
    return true;
  } catch (err) {
    logWarn('app', '[ads] interstitial skipped', { err: String(err) });
    return false;
  } finally {
    interstitialInFlight = false;
  }
}

/* ── Rewarded ───────────────────────────────────────────────────────────── */

export type RewardedSsv = { userId: string; customData: string };

/**
 * Show a rewarded video. Resolves true only when the SDK reports the reward
 * was actually earned. The reward itself is granted server-side, and only
 * after Google's signed SSV callback (carrying `ssv`) has been verified.
 */
export async function showRewardedAd(ssv?: RewardedSsv): Promise<boolean> {
  const mod = await loadPlugin();
  if (!mod || !(await initAds())) return false;
  try {
    await mod.AdMob.prepareRewardVideoAd({
      adId: adConfig.rewardedId,
      isTesting: adConfig.isTesting,
      ...(ssv ? { ssv } : {}),
    });
    const reward = await mod.AdMob.showRewardVideoAd();
    return !!reward;
  } catch (err) {
    logWarn('app', '[ads] rewarded ad unavailable', { err: String(err) });
    return false;
  }
}
