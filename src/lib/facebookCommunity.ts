/**
 * Canonical Facebook group deep-link helper.
 *
 * Every Facebook "Join Community / Join Group" button in the app MUST call
 * `openFacebookCommunity()` from this module — never construct a Facebook URL
 * inline. This prevents UI drift from the official destination.
 *
 * Behaviour:
 *  - Mobile (Android/iOS): try the native FB app via `fb://facewebmodal`,
 *    fall back to the browser group page if the app doesn't intercept.
 *  - Desktop / fallback: open the group page in a new tab.
 *  - Emits `facebook_community_clicked` analytics (dataLayer + gtag + window
 *    event + `community_clicks` table) including which path was taken
 *    (`app_attempted` vs `browser_fallback`) so install-vs-fallback and
 *    conversion can be measured.
 *
 * NOTE: The Facebook share intent (sharing a referral URL) is a different
 * feature and lives in pages/Referral.tsx — do NOT route it through here.
 */

import { toast } from 'sonner';
import { trackCommunityClick } from '@/lib/communityTracking';

export const FACEBOOK_COMMUNITY_URL = 'https://www.facebook.com/share/g/1bukdmNEuH/';
export const FACEBOOK_COMMUNITY_LABEL = 'Join the HabTastic AI Group';
export const FACEBOOK_BRAND_BLUE = '#1877F2';

// fb://facewebmodal/f?href=<url> opens the group inside the installed FB app
// on iOS; Android's FB app intercepts facebook.com links automatically, but
// this URI works there too.
const FACEBOOK_APP_URL = `fb://facewebmodal/f?href=${encodeURIComponent(FACEBOOK_COMMUNITY_URL)}`;

export type FacebookOpenOutcome = 'app_attempted' | 'browser_fallback' | 'blocked' | 'error';

function emitAnalytics(source: string | undefined, outcome: FacebookOpenOutcome) {
  try {
    const detail = {
      source: source ?? null,
      url: FACEBOOK_COMMUNITY_URL,
      outcome,
      platform: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '') ? 'mobile' : 'web',
    };
    const w = window as unknown as {
      dataLayer?: unknown[];
      gtag?: (event: string, name: string, params: Record<string, unknown>) => void;
    };
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event: 'facebook_community_clicked', ...detail });
    }
    if (typeof w.gtag === 'function') {
      w.gtag('event', 'facebook_community_clicked', detail);
    }
    window.dispatchEvent(new CustomEvent('facebook_community_clicked', { detail }));
  } catch {
    /* analytics must never block UX */
  }
}

let _lastOpenAt = 0;

/**
 * Open the official HabTastic AI Facebook group. Debounced so rapid taps fire
 * analytics exactly once.
 */
export function openFacebookCommunity(source?: string): void {
  const now = Date.now();
  if (now - _lastOpenAt < 800) return;
  _lastOpenAt = now;

  // Fire-and-forget DB tracking (separate from JS analytics so we can join later).
  void trackCommunityClick('facebook', source);

  try {
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    if (isMobile) {
      const start = Date.now();
      emitAnalytics(source, 'app_attempted');
      const fallback = window.setTimeout(() => {
        // If the app took over, the page is backgrounded and this timer is
        // delayed past the threshold — only open the browser if we're still here.
        if (Date.now() - start < 2000) {
          emitAnalytics(source, 'browser_fallback');
          const win = window.open(FACEBOOK_COMMUNITY_URL, '_blank', 'noopener,noreferrer');
          if (!win) {
            emitAnalytics(source, 'blocked');
            toast.error('Unable to open community page');
          }
        }
      }, 600);
      window.location.href = FACEBOOK_APP_URL;
      window.setTimeout(() => window.clearTimeout(fallback), 2500);
      return;
    }

    emitAnalytics(source, 'browser_fallback');
    const win = window.open(FACEBOOK_COMMUNITY_URL, '_blank', 'noopener,noreferrer');
    if (!win) {
      emitAnalytics(source, 'blocked');
      throw new Error('blocked');
    }
  } catch {
    emitAnalytics(source, 'error');
    toast.error('Unable to open community page');
  }
}
