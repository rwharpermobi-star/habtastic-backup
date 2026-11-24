// User-facing handling for AI avatar provider outages (out of credit, billing,
// rate limits, bad provider key). Users never see provider/billing details; they
// are steered to the 60 bundled 3D presets, which never use AI credits. There is
// no illustrated/instant fallback: the user's avatar is left unchanged.

export const AVATAR_SERVICE_BREAK_MESSAGE =
  'AI avatars are taking a break right now. Pick one of the 60 avatars instead — no credits were used.';

const PROVIDER_OUTAGE_CODES = new Set([
  'RATE_LIMITED',
  'PROVIDER_BILLING_REQUIRED',
  'SERVICE_PAUSED',
  'API_KEY_INVALID',
  'SERVICE_UNAVAILABLE',
  'MISSING_CONFIGURATION',
]);

// Provider statuses the server stores on a failed request (replayed results keep them).
const PROVIDER_OUTAGE_STATUSES = new Set([401, 402, 403, 404, 429]);

const PROVIDER_DETAIL_PATTERN = /openai|billing|api key|api_key|usage limit|available balance/i;

type AvatarErrorPayload = { code?: unknown; status?: unknown; error?: unknown } | null | undefined;

/**
 * True when a generate-avatar response means the AI provider is unavailable
 * rather than a problem with the user's request or their own daily credits.
 * A bare 401 without a provider code is the user's own expired sign-in.
 */
export function isAvatarProviderUnavailable(httpStatus: number, payload: AvatarErrorPayload): boolean {
  const code = typeof payload?.code === 'string' ? payload.code : undefined;
  if (code === 'DAILY_LIMIT_REACHED' || code === 'IN_PROGRESS' || code === 'CONFIRMATION_INTERRUPTED') return false;
  if (code && PROVIDER_OUTAGE_CODES.has(code)) return true;
  if (httpStatus === 429 || httpStatus === 402) return true;
  if (code === 'REQUEST_FINISHED' && typeof payload?.status === 'number' && PROVIDER_OUTAGE_STATUSES.has(payload.status)) return true;
  if (httpStatus === 401) return false;
  // Older stored results may still carry provider billing text; never show it.
  return typeof payload?.error === 'string' && PROVIDER_DETAIL_PATTERN.test(payload.error);
}
