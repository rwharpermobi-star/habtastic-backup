/**
 * Regression test: drive InviteEarnCard through repeated referralCode
 * transitions (null → code → null → code) and assert two things:
 *
 *   1. No console.error is emitted (catches React's "Rendered more hooks
 *      than during the previous render" and similar invariant violations,
 *      which React reports via console.error before throwing).
 *
 *   2. The DOM never ends up in a "blank screen" state when a referral
 *      code is present — and is correctly empty (early-return) when null.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks -----------------------------------------------------------------

const mockReferral = vi.fn();
vi.mock('@/hooks/useReferral', () => ({
  useReferral: () => mockReferral(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

import InviteEarnCard from '../InviteEarnCard';

const MILESTONES = [
  { count: 10, label: '7 Days Premium' },
  { count: 25, label: '14 Days Premium' },
  { count: 50, label: '30 Days Premium' },
];

const referralState = (code: string | null) => ({
  referralCode: code,
  referralCount: code ? 2 : 0,
  paidReferralCount: code ? 1 : 0,
  totalDaysEarned: 0,
  MILESTONES,
});

const wrap = () => (
  <MemoryRouter>
    <InviteEarnCard />
  </MemoryRouter>
);

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockReferral.mockReset();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

describe('InviteEarnCard — referralCode transition stability', () => {
  it('handles null → code → null → code without console errors or blank screens', () => {
    // ---- Phase 1: null (early return → empty container, NOT a crash) ------
    mockReferral.mockReturnValue(referralState(null));
    const { container, rerender } = render(wrap());

    expect(
      container.firstChild,
      'With no referral code the component should early-return null (empty container)'
    ).toBeNull();

    // ---- Phase 2: code arrives (full render) ------------------------------
    mockReferral.mockReturnValue(referralState('ABC123'));
    rerender(wrap());

    expect(
      container.firstChild,
      'With a referral code the component must render content (no blank screen)'
    ).not.toBeNull();
    expect(container.textContent ?? '').not.toBe('');

    // ---- Phase 3: code goes back to null ----------------------------------
    mockReferral.mockReturnValue(referralState(null));
    rerender(wrap());

    expect(
      container.firstChild,
      'Returning to a null code should re-enter early-return cleanly'
    ).toBeNull();

    // ---- Phase 4: code returns again --------------------------------------
    mockReferral.mockReturnValue(referralState('XYZ789'));
    rerender(wrap());

    expect(container.firstChild).not.toBeNull();
    expect(container.textContent ?? '').toContain('XYZ789');

    // ---- Console assertion ------------------------------------------------
    // React reports hook-order violations and other invariant failures via
    // console.error BEFORE throwing — so any call here means a regression.
    const reactErrors = consoleErrorSpy.mock.calls.filter((args) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
      return (
        msg.includes('Rendered more hooks') ||
        msg.includes('Rendered fewer hooks') ||
        msg.includes('change in the order of Hooks') ||
        msg.includes('Warning:') // any React warning
      );
    });

    expect(
      reactErrors,
      `Expected no React errors during referralCode transitions, but got:\n` +
        reactErrors.map((e) => '  • ' + e.join(' ')).join('\n')
    ).toEqual([]);
  });
});
