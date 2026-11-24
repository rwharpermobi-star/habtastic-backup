// Remembers, on this device, the last purchase whose server verification did
// not finish, so the subscription screen can explain it and guide a restore.
// This is display state only: Premium is always decided server-side.

export type VerificationProvider = 'google_play' | 'paystack';
export type VerificationState = 'pending' | 'failed';

export interface VerificationRecord {
  provider: VerificationProvider;
  plan: 'monthly' | 'yearly' | 'unknown';
  state: VerificationState;
  code: string;
  at: string;
}

/** Records older than this are dropped; by then the server has settled. */
export const VERIFICATION_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Codes meaning "money may have moved and the server will keep trying":
 * the provider webhook can still activate Premium without user action.
 */
const PENDING_CODES = new Set([
  'payment_pending',
  'verification_unavailable',
  'server_error',
  'rate_limited',
  'network_error',
]);

export function verificationStateForCode(code: string): VerificationState {
  return PENDING_CODES.has(code) ? 'pending' : 'failed';
}

const storageKey = (userId: string) => `habtastic.purchaseVerification.${userId}`;

export function saveVerificationRecord(
  userId: string,
  record: Omit<VerificationRecord, 'state' | 'at'> & { at?: string },
): void {
  const full: VerificationRecord = {
    ...record,
    state: verificationStateForCode(record.code),
    at: record.at ?? new Date().toISOString(),
  };
  try { localStorage.setItem(storageKey(userId), JSON.stringify(full)); } catch { /* storage unavailable */ }
}

export function readVerificationRecord(userId: string): VerificationRecord | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VerificationRecord>;
    if (
      (parsed.provider !== 'google_play' && parsed.provider !== 'paystack') ||
      (parsed.state !== 'pending' && parsed.state !== 'failed') ||
      typeof parsed.code !== 'string' || typeof parsed.at !== 'string'
    ) return null;
    return parsed as VerificationRecord;
  } catch {
    return null;
  }
}

export function clearVerificationRecord(userId: string): void {
  try { localStorage.removeItem(storageKey(userId)); } catch { /* storage unavailable */ }
}

export interface VerificationNotice {
  state: VerificationState;
  provider: VerificationProvider;
  code: string;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'non-renewing']);

/**
 * Decides which verification notice the subscription screen shows.
 * - An active subscription updated after the problem means it resolved.
 * - Records older than the TTL are ignored.
 * - Otherwise a stored record wins; a server row stuck on "pending" also counts.
 */
export function resolveVerificationNotice(
  record: VerificationRecord | null,
  sub: { status: string; provider: string; updated_at?: string | null } | null,
  now: number = Date.now(),
): VerificationNotice | null {
  const subActive = !!sub && ACTIVE_STATUSES.has(sub.status);
  if (record) {
    const recordAt = new Date(record.at).getTime();
    const expired = !Number.isFinite(recordAt) || now - recordAt > VERIFICATION_RECORD_TTL_MS;
    const resolvedByServer =
      subActive && (!sub?.updated_at || new Date(sub.updated_at).getTime() >= recordAt);
    if (!expired && !resolvedByServer) {
      return { state: record.state, provider: record.provider, code: record.code };
    }
  }
  if (sub?.status === 'pending') {
    return {
      state: 'pending',
      provider: sub.provider === 'google_play' ? 'google_play' : 'paystack',
      code: 'payment_pending',
    };
  }
  return null;
}
