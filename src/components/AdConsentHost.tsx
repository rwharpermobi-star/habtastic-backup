import { useEffect } from 'react';
import { useAds } from '@/hooks/useAds';
import { initAds } from '@/lib/ads/adService';

/**
 * Starts the AdMob SDK and shows Google's consent form (where required) early,
 * for Free users only, instead of right before the first ad. Renders nothing.
 * The app shows no banner ads; rewarded and interstitial ads use adService.
 */
export default function AdConsentHost() {
  const { adsEnabled } = useAds();

  useEffect(() => {
    if (!adsEnabled) return;
    const t = window.setTimeout(() => { void initAds(); }, 3000);
    return () => window.clearTimeout(t);
  }, [adsEnabled]);

  return null;
}
