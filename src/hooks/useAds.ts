import { useCallback } from 'react';
import { usePremium } from '@/hooks/usePremium';
import { useProfile } from '@/hooks/useProfile';
import { adsSupported, maybeShowInterstitial } from '@/lib/ads/adService';

/**
 * React wrapper for the centralised AdMob service.
 *
 * Ads are native-only and only for Free users. Premium from Google Play,
 * the website, referrals or the trial is ad-free. Nothing shows until the
 * profile has loaded, so a Premium user never sees an ad while it loads.
 */
export function useAds() {
  const { isPremium } = usePremium();
  const { profile } = useProfile();
  const adsEnabled = !!profile && !isPremium && adsSupported();

  const showInterstitial = useCallback(async () => {
    if (!adsEnabled) return false;
    return maybeShowInterstitial();
  }, [adsEnabled]);

  return { adsEnabled, showInterstitial };
}
