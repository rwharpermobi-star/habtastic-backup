/**
 * Regression test for the "Rendered more hooks than during the previous render"
 * crash that previously took the app to a blank screen.
 *
 * The bug: InviteEarnCard had `if (!referralCode) return null;` positioned
 * BEFORE several useEffect hooks. On the initial render referralCode was null
 * (early return → fewer hooks), then once the referral code loaded React saw
 * MORE hooks on the second render and threw.
 *
 * This test guards two invariants:
 *   1. Static: the early `return null` must come AFTER every hook call in the
 *      component source.
 *   2. Runtime: rendering with referralCode=null and then re-rendering with a
 *      real code must not throw (which is exactly what the hook-order error did).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks -----------------------------------------------------------------

// useReferral is the source of `referralCode`; we control it per test.
const mockReferral = vi.fn();
vi.mock('@/hooks/useReferral', () => ({
  useReferral: () => mockReferral(),
}));

// Auth context is touched indirectly; stub it out so the component tree mounts.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user' }, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Sonner toast is fire-and-forget here.
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

const renderCard = () =>
  render(
    <MemoryRouter>
      <InviteEarnCard />
    </MemoryRouter>
  );

beforeEach(() => {
  mockReferral.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('InviteEarnCard — hook-order regression', () => {
  it('source: every React hook call appears BEFORE the `return null` early-exit', () => {
    const filePath = resolve(__dirname, '../InviteEarnCard.tsx');
    const source = readFileSync(filePath, 'utf8');

    // Strip block + line comments so commented-out code can't fool the check.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const lines = stripped.split('\n');
    const earlyReturnIdx = lines.findIndex((l) =>
      /if\s*\(\s*!\s*referralCode\s*\)\s*return\s+null/.test(l)
    );

    expect(
      earlyReturnIdx,
      'Expected to find `if (!referralCode) return null;` guard'
    ).toBeGreaterThan(-1);

    // React hook usage we care about (anything beginning with `use` + capital).
    const hookCallRegex = /\buse[A-Z]\w*\s*\(/;

    const hookLinesAfterReturn = lines
      .slice(earlyReturnIdx + 1)
      .map((line, i) => ({ line, lineNumber: earlyReturnIdx + 2 + i }))
      .filter(({ line }) => hookCallRegex.test(line));

    expect(
      hookLinesAfterReturn,
      `Found hook call(s) AFTER the \`return null\` guard — this re-introduces ` +
        `the "Rendered more hooks than during the previous render" crash. ` +
        `Move the guard below all hooks.\n` +
        hookLinesAfterReturn.map((h) => `  L${h.lineNumber}: ${h.line.trim()}`).join('\n')
    ).toHaveLength(0);
  });

  it('runtime: rendering with referralCode=null does not throw', () => {
    mockReferral.mockReturnValue({
      referralCode: null,
      referralCount: 0,
      paidReferralCount: 0,
      totalDaysEarned: 0,
      MILESTONES,
    });

    expect(() => renderCard()).not.toThrow();
  });

  it('runtime: re-rendering with a referral code (after starting null) does not throw a hook-order error', () => {
    // Phase 1 — null code (early-return path).
    mockReferral.mockReturnValue({
      referralCode: null,
      referralCount: 0,
      paidReferralCount: 0,
      totalDaysEarned: 0,
      MILESTONES,
    });
    const { rerender } = renderCard();

    // Phase 2 — code arrives (full render path). If hooks are misordered,
    // React will throw "Rendered more hooks than during the previous render".
    mockReferral.mockReturnValue({
      referralCode: 'ABC123',
      referralCount: 2,
      paidReferralCount: 1,
      totalDaysEarned: 0,
      MILESTONES,
    });

    expect(() =>
      rerender(
        <MemoryRouter>
          <InviteEarnCard />
        </MemoryRouter>
      )
    ).not.toThrow();
  });
});
