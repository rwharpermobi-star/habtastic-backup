/**
 * Where ads may appear (Google Play ad policy). Pure rules, no SDK calls.
 *
 * - Interstitials: never on launch, never over core actions (habit logging,
 *   Winston, checkout/paywall, onboarding, sign-in), never while a dialog or
 *   sheet is open, only on a natural tab change after the app has been in use.
 * - No banner ads anywhere.
 */

/** Screens where no full-screen ad may ever appear. Prefix match. */
export const INTERSTITIAL_BLOCKED_PREFIXES = [
  '/habits', '/coach', '/winston', '/journal', '/money',
  '/pricing', '/checkout', '/subscription', '/paywall',
  '/onboarding', '/auth', '/login', '/signup', '/reset-password',
  '/delete-account', '/privacy', '/terms',
];

/** Exact home routes, where habits are logged. */
const INTERSTITIAL_BLOCKED_EXACT = new Set(['/', '/app']);

/** No full-screen ad in the first minute after the app opens. */
export const LAUNCH_GRACE_MS = 60 * 1000;

const matchesPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function isInterstitialAllowedOnRoute(path: string): boolean {
  if (INTERSTITIAL_BLOCKED_EXACT.has(path)) return false;
  return !INTERSTITIAL_BLOCKED_PREFIXES.some((p) => matchesPrefix(path, p));
}

export function isPastLaunchGrace(appStartedAt: number, now = Date.now()): boolean {
  return now - appStartedAt >= LAUNCH_GRACE_MS;
}
