/**
 * Auth startup telemetry — strictly non-PII.
 *
 * Measures how long authentication hydration takes and flags the routing
 * regression where the public Landing page renders for a user who already has
 * a stored Supabase session. Only durations, counters and booleans are sent;
 * never emails, names, tokens, referral codes or user ids.
 */
import { trackEvent } from '@/lib/telemetrySink';
import { logWarn } from '@/lib/logger';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let bootStart: number | null = null;
let sessionRestoredAt: number | null = null;
let uiReadyReported = false;
let regressionCount = 0;

/** Called once when AuthProvider starts resolving the session. */
export function markAuthBootStart() {
  if (bootStart !== null) return;
  bootStart = now();
  sessionRestoredAt = null;
  uiReadyReported = false;
}

/**
 * Called when the auth hydration finishes (session known, loading released).
 * `authenticated` is a boolean only — no identity data.
 */
export function markAuthHydrated(authenticated: boolean, source: 'boot' | 'auth_event') {
  if (bootStart === null || sessionRestoredAt !== null) return;
  sessionRestoredAt = now();
  trackEvent('auth_startup', 'auth hydration complete', {
    hydration_ms: Math.round(sessionRestoredAt - bootStart),
    authenticated,
    source,
  });
}

/** Called when the first authenticated screen is actually rendered. */
export function markAuthedUiReady() {
  if (uiReadyReported || bootStart === null) return;
  uiReadyReported = true;
  const t = now();
  trackEvent('auth_startup', 'authenticated UI ready', {
    ui_ready_ms: Math.round(t - bootStart),
    session_restore_ms: sessionRestoredAt === null ? null : Math.round(sessionRestoredAt - bootStart),
  });
}

/**
 * The Landing (marketing) page rendered while a Supabase session existed in
 * storage — that is the flash bug this module guards against.
 */
export function recordLandingFlashRegression(context: { pathname: string; authLoading: boolean }) {
  regressionCount += 1;
  logWarn('navigation', 'landing rendered with cached session (routing regression)', {
    pathname: context.pathname.split('?')[0],
    authLoading: context.authLoading,
    occurrences: regressionCount,
  });
  trackEvent('auth_routing_regression', 'landing shown to authenticated session', {
    pathname: context.pathname.split('?')[0],
    authLoading: context.authLoading,
    occurrences: regressionCount,
  });
  try {
    (window as any).__habtasticLandingFlashCount = regressionCount;
  } catch {
    /* noop */
  }
}

/** Test/diagnostics helper. */
export function getLandingFlashCount() {
  return regressionCount;
}

export function resetAuthTelemetryForTests() {
  bootStart = null;
  sessionRestoredAt = null;
  uiReadyReported = false;
  regressionCount = 0;
}
