import { describe, expect, it } from 'vitest';
import {
  resolveVerificationNotice,
  verificationStateForCode,
  VERIFICATION_RECORD_TTL_MS,
  type VerificationRecord,
} from '@/lib/purchaseVerification';

const at = '2026-11-18T10:00:00Z';
const now = new Date(at).getTime() + 60_000;
const record = (overrides: Partial<VerificationRecord> = {}): VerificationRecord => ({
  provider: 'google_play', plan: 'monthly', state: 'pending', code: 'verification_unavailable', at, ...overrides,
});

describe('purchase verification notices', () => {
  it('treats a temporary server problem as pending, not failed', () => {
    expect(verificationStateForCode('verification_unavailable')).toBe('pending');
    expect(verificationStateForCode('payment_pending')).toBe('pending');
  });

  it('treats a wrong account or missing purchase as failed', () => {
    expect(verificationStateForCode('account_mismatch')).toBe('failed');
    expect(verificationStateForCode('purchase_not_found')).toBe('failed');
  });

  it('hides the notice once an active subscription arrives after the problem', () => {
    const sub = { status: 'active', provider: 'google_play', updated_at: '2026-11-18T10:05:00Z' };
    expect(resolveVerificationNotice(record(), sub, now)).toBeNull();
  });

  it('keeps the notice when the active subscription is older than the failed purchase', () => {
    const sub = { status: 'active', provider: 'google_play', updated_at: '2026-11-01T00:00:00Z' };
    expect(resolveVerificationNotice(record({ code: 'account_mismatch', state: 'failed' }), sub, now)?.state).toBe('failed');
  });

  it('drops records older than 7 days', () => {
    expect(resolveVerificationNotice(record(), null, new Date(at).getTime() + VERIFICATION_RECORD_TTL_MS + 1)).toBeNull();
  });

  it('shows pending when the server row is still pending', () => {
    expect(resolveVerificationNotice(null, { status: 'pending', provider: 'paystack' }, now))
      .toEqual({ state: 'pending', provider: 'paystack', code: 'payment_pending' });
  });
});
