import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePremium } from '@/hooks/usePremium';
import { writePremiumCache } from '@/lib/premiumCache';

type TestProfile = { is_premium: boolean; premium_until: string | null; trial_started_at: string | null };
const state = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  authLoading: false,
  profile: null as TestProfile | null,
  profileLoading: false,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user, loading: state.authLoading }),
}));
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: state.profile, loading: state.profileLoading }),
}));

const NOW = Date.parse('2026-11-23T00:00:00Z');
const DAY = 864e5;
const iso = (ms: number) => new Date(ms).toISOString();

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
  state.user = { id: 'user-a' };
  state.authLoading = false;
  state.profile = null;
  state.profileLoading = false;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Premium entitlement', () => {
  it('active paid Premium (server says is_premium until a future date) is Premium', () => {
    state.profile = { is_premium: true, premium_until: iso(NOW + 300 * DAY), trial_started_at: null };
    const { result } = setup();
    expect(result.current.entitlementLoading).toBe(false);
    expect(result.current.isPaidPremium).toBe(true);
    expect(result.current.isPremium).toBe(true);
  });

  it('lifetime Premium (is_premium with no end date) is Premium', () => {
    state.profile = { is_premium: true, premium_until: null, trial_started_at: null };
    const { result } = setup();
    expect(result.current.isPaidPremium).toBe(true);
  });

  it('free user is restricted', () => {
    state.profile = { is_premium: false, premium_until: null, trial_started_at: null };
    const { result } = setup();
    expect(result.current.entitlementLoading).toBe(false);
    expect(result.current.isPremium).toBe(false);
  });

  it('expired paid Premium is restricted even though is_premium is still true', () => {
    state.profile = { is_premium: true, premium_until: iso(NOW - 1000), trial_started_at: null };
    const { result } = setup();
    expect(result.current.isPaidPremium).toBe(false);
    expect(result.current.isPremium).toBe(false);
  });

  it('unpaid/unverified (premium_until set but is_premium false) is restricted', () => {
    state.profile = { is_premium: false, premium_until: iso(NOW + 30 * DAY), trial_started_at: null };
    const { result } = setup();
    expect(result.current.isPremium).toBe(false);
  });

  it('reports loading while auth is restoring, and never claims Premium meanwhile', () => {
    state.user = null;
    state.authLoading = true;
    const { result } = setup();
    expect(result.current.entitlementLoading).toBe(true);
    expect(result.current.isPremium).toBe(false);
  });

  it('reports loading while the profile is in flight with no cached snapshot', () => {
    state.profileLoading = true;
    const { result } = setup();
    expect(result.current.entitlementLoading).toBe(true);
  });

  it('uses this user\'s cached snapshot during load instead of a false lock', () => {
    writePremiumCache('user-a', { is_premium: true, premium_until: iso(NOW + 30 * DAY) });
    state.profileLoading = true;
    const { result } = setup();
    expect(result.current.entitlementLoading).toBe(false);
    expect(result.current.isPaidPremium).toBe(true);
  });

  it('a failed profile load with no cache resolves to restricted, not loading', () => {
    state.profileLoading = false;
    state.profile = null;
    const { result } = setup();
    expect(result.current.entitlementLoading).toBe(false);
    expect(result.current.isPremium).toBe(false);
  });

  it('server profile overrides a tampered/stale cache that claims Premium', () => {
    writePremiumCache('user-a', { is_premium: true, premium_until: null });
    state.profile = { is_premium: false, premium_until: null, trial_started_at: null };
    const { result } = setup();
    expect(result.current.isPremium).toBe(false);
  });

  it('switching to another account never reuses the previous user\'s Premium', () => {
    state.profile = { is_premium: true, premium_until: iso(NOW + 30 * DAY), trial_started_at: null };
    const { result, rerender } = setup();
    expect(result.current.isPaidPremium).toBe(true);

    // Session changes to user B whose profile is still loading.
    state.user = { id: 'user-b' };
    state.profile = null;
    state.profileLoading = true;
    rerender();
    expect(result.current.isPremium).toBe(false);
    expect(result.current.entitlementLoading).toBe(true);

    state.profile = { is_premium: false, premium_until: null, trial_started_at: null };
    state.profileLoading = false;
    rerender();
    expect(result.current.entitlementLoading).toBe(false);
    expect(result.current.isPremium).toBe(false);
  });

  it('unlocks as soon as a purchase/restore refresh returns an active server profile', () => {
    state.profile = { is_premium: false, premium_until: null, trial_started_at: null };
    const { result, rerender } = setup();
    expect(result.current.isPremium).toBe(false);
    state.profile = { is_premium: true, premium_until: iso(NOW + 30 * DAY), trial_started_at: null };
    rerender();
    expect(result.current.isPaidPremium).toBe(true);
  });
});
