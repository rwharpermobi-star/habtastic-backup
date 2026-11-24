import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePremium } from '@/hooks/usePremium';

const state = vi.hoisted(() => ({
  profile: { is_premium: false, premium_until: null as string | null, trial_started_at: null as string | null },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'expiry-test-user' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: state.profile }) }));

const NOW = Date.parse('2026-10-04T04:00:00Z');
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => usePremium(), { wrapper });
}
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.profile = { is_premium: false, premium_until: null, trial_started_at: null };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Premium expiry', () => {
  it('expires Premium access at the five-day boundary without limiting free habits', () => {
    state.profile.trial_started_at = new Date(NOW - 5 * 864e5 + 1000).toISOString();
    const { result } = setup();
    expect(result.current.isPremium).toBe(true);
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.isPremium).toBe(false);
    expect(result.current.trialExpired).toBe(true);
    expect(result.current.canAddHabit(4)).toBe(true);
    expect(result.current.canAccess(result.current.FEATURES.CLOUD_SYNC)).toBe(true);
  });
  it('locks paid access at expiry and unlocks again when the server confirms renewal', () => {
    state.profile = { is_premium: true, premium_until: new Date(NOW + 1000).toISOString(), trial_started_at: null };
    const { result, rerender } = setup();
    expect(result.current.isPaidPremium).toBe(true);
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.isPremium).toBe(false);
    state.profile = { ...state.profile, premium_until: new Date(NOW + 864e5).toISOString() };
    rerender();
    expect(result.current.isPaidPremium).toBe(true);
  });
  it('does not accept a future-dated trial', () => {
    state.profile.trial_started_at = new Date(NOW + 864e5).toISOString();
    const { result } = setup();
    expect(result.current.isPremium).toBe(false);
  });
});
