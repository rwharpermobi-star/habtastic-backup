// How the Google Play RTDN webhook answers Pub/Sub when it cannot process a
// notification.
//
// Pub/Sub redelivers every push that does not get a 2xx back, for as long as
// the subscription keeps the message (7 days). Between 13 and 18 November 2026
// failed lookups were answered with 4xx/5xx and the subscription retried
// immediately, so a handful of notifications turned into thousands of
// Google Play API calls and edge-function invocations.
//
// Rule: only a failure that can succeed later is answered with 5xx (Pub/Sub
// retries it, with the subscription's exponential backoff). A failure that will
// fail the same way every time is acknowledged with 200 and logged, so Pub/Sub
// drops it. Entitlement is never granted on either path.

export type RtdnDisposition = "retry" | "drop";

/**
 * Disposition for a failed purchases.subscriptionsv2.get lookup.
 * - 401/403: our credentials or Play permissions are wrong. Fixing the secret
 *   makes it work, so keep the message (backoff limits the call rate).
 * - 408/429/5xx/network (status 0): temporary on Google's side.
 * - Anything else (400 bad token, 404/410 unknown or expired purchase):
 *   permanent for this token.
 */
export function dispositionForPlayLookup(status: number): RtdnDisposition {
  if (status === 0) return "retry";
  if (status === 401 || status === 403) return "retry";
  if (status === 408 || status === 429) return "retry";
  if (status >= 500) return "retry";
  return "drop";
}

/** HTTP status the webhook returns to Pub/Sub for a disposition. */
export function rtdnStatusFor(disposition: RtdnDisposition): number {
  return disposition === "retry" ? 503 : 200;
}
