import { Capacitor } from '@capacitor/core';

/**
 * Production web origin used for email links (password reset, email
 * confirmation, etc). In the native Android/iOS release APK,
 * `window.location.origin` resolves to `http://localhost` (Capacitor's
 * bundled WebView origin), which produces broken links in emails. We
 * always want emailed links to open the real production web app.
 */
export const PRODUCTION_WEB_ORIGIN = 'https://habtastic.com';

/**
 * Returns the origin that should be used when constructing URLs that
 * will be emailed to the user or otherwise opened outside the current
 * WebView. On native platforms this is always the production web origin.
 * On the web it uses the current origin so preview/staging/localhost
 * flows keep working.
 */
export function getEmailLinkOrigin(): string {
  if (Capacitor.isNativePlatform()) return PRODUCTION_WEB_ORIGIN;
  if (typeof window === 'undefined') return PRODUCTION_WEB_ORIGIN;
  const origin = window.location.origin;
  // Guard against Capacitor-served origins that occasionally leak through
  if (/^https?:\/\/localhost(?::\d+)?$/i.test(origin) && Capacitor.getPlatform() !== 'web') {
    return PRODUCTION_WEB_ORIGIN;
  }
  return origin;
}
