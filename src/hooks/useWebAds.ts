import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { logWarn } from '@/lib/logger';

const ADSENSE_SCRIPT_ID = 'habtastic-adsense';
const RELOAD_GUARD_KEY = 'habtastic:adsense-clean-reload';

const adsenseClientId = String(import.meta.env.VITE_ADSENSE_CLIENT_ID ?? '').trim();
const webAdsConfigured = import.meta.env.PROD && /^ca-pub-\d+$/.test(adsenseClientId);

/**
 * Loads Google AdSense Auto ads only for eligible Free users in the browser/PWA.
 * Native shells keep using AdMob through useAds()/adService instead.
 *
 * AdSense Auto ads inject DOM outside React. If a Free user upgrades or signs
 * out during the same SPA session, a one-time reload is the safest way to clear
 * Google's injected placements and guarantee that Premium/signed-out users are
 * ad-free immediately.
 */
export function useWebAds(enabled: boolean) {
  useEffect(() => {
    if (!webAdsConfigured || Capacitor.isNativePlatform() || !enabled) return;

    sessionStorage.removeItem(RELOAD_GUARD_KEY);

    let script = document.getElementById(ADSENSE_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = ADSENSE_SCRIPT_ID;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClientId)}`;
      script.dataset.adClient = adsenseClientId;
      script.onerror = () => {
        logWarn('app', '[ads] AdSense failed to load');
      };
      document.head.appendChild(script);
    }

    return () => {
      // Auto ads can leave injected frames/anchors after the loader is removed.
      // Reload once when eligibility disappears so an upgraded or signed-out
      // user never carries Free-tier web ads into an ad-free session.
      if (!document.getElementById(ADSENSE_SCRIPT_ID)) return;
      if (sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      window.location.reload();
    };
  }, [enabled]);
}
