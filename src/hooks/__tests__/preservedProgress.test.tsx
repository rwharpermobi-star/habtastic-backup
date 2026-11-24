import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHabits } from '@/hooks/useHabits';
import { useMoneySaver } from '@/hooks/useMoneySaver';
import { useChallenges } from '@/hooks/useChallenges';

const state = vi.hoisted(() => ({
  premium: false,
  rows: {} as Record<string, any[]>,
  writes: vi.fn(),
  rpc: vi.fn(),
  updateError: null as null | { message: string },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'progress-user' } }) }));
vi.mock('@/hooks/usePremium', () => ({ usePremium: () => ({ isPremium: state.premium, FREE_HABIT_LIMIT: 4, premiumProgressLocked: !state.premium }) }));
vi.mock('@/lib/sfx', () => ({ playHabitComplete: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ vibrateSuccess: vi.fn() }));
vi.mock('@/lib/offlineOutbox', () => ({
  cacheHabitsSnapshot: vi.fn(), readHabitsSnapshot: () => null, enqueueCompletion: vi.fn(),
  installOutboxAutoFlush: vi.fn(() => () => {}), flushOutbox: async () => 0, isOnline: () => true,
  applyPendingCompletions: (_uid: string, rows: unknown[]) => rows,
  pendingCompletion: vi.fn(), hasLegacyOutbox: () => false,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    let write = false;
    const query = {
      select: () => query, eq: () => query, order: () => query,
      update: (data: unknown) => { write = true; state.writes(table, data); return query; },
      delete: () => { write = true; state.writes(table, 'delete'); return query; },
      then: (resolve) => Promise.resolve({ data: state.rows[table] ?? [], error: write ? state.updateError : null }).then(resolve),
    };
    return query;
  },
  rpc: state.rpc,
} }));

function setup<T>(hook: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(hook, { wrapper }), client };
}
beforeEach(() => {
  state.premium = false;
  state.writes.mockReset(); state.rpc.mockReset(); state.updateError = null;
  state.rows = {
    habits: Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, user_id: 'progress-user', name: `Habit ${i}`, completions: ['2026-09-01'], created_at: new Date(i * 1000).toISOString() })),
    savings_goals: [1, 2, 3].map(i => ({ id: `g${i}`, name: `Goal ${i}`, status: 'active', current_amount: 100 * i, created_at: new Date(i * 1000).toISOString() })),
    savings_entries: [{ id: 'e1', goal_id: 'g2', amount: 200 }],
    savings_challenges: [],
    challenges: [{ id: 'c1', user_id: 'progress-user', duration: 7, completed_days: ['2026-09-01'], start_date: '2026-10-01' }],
  };
});
afterEach(cleanup);

describe('saved Premium progress', () => {
  it('keeps all six habit histories, allows four on Free, and restores all after renewal', async () => {
    const { result, rerender, client } = setup(useHabits);
    await waitFor(() => expect(result.current.allHabits).toHaveLength(6));
    expect(result.current.habits).toHaveLength(4);
    expect(result.current.lockedHabits.map(h => h.id)).toEqual(['h4', 'h5']);
    await act(async () => { expect(await result.current.toggleCompletion('h5')).toBe(false); });
    expect(state.writes).not.toHaveBeenCalled();
    const original = client.getQueryData(['habits', 'progress-user']);
    state.premium = true; rerender();
    expect(result.current.habits).toHaveLength(6);
    expect(result.current.lockedHabits).toEqual([]);
    expect(client.getQueryData(['habits', 'progress-user'])).toBe(original);
    expect(result.current.habits[5].completions).toEqual(['2026-09-01']);
  });
  it('preserves savings balances and entries while refusing writes to locked goals', async () => {
    const { result, rerender } = setup(useMoneySaver);
    await waitFor(() => expect(result.current.goals).toHaveLength(3));
    expect(result.current.activeGoals.map(g => g.id)).toEqual(['g1']);
    expect(result.current.lockedGoals.map(g => g.current_amount)).toEqual([200, 300]);
    await expect(result.current.addSavings('g2', 50)).rejects.toThrow(/locked/);
    expect(state.rpc).not.toHaveBeenCalled();
    state.premium = true; rerender();
    expect(result.current.activeGoals.map(g => g.current_amount)).toEqual([100, 200, 300]);
    expect(result.current.entries).toEqual([{ id: 'e1', goal_id: 'g2', amount: 200 }]);
  });
  it('does not apply a challenge check-in when the server denies it at expiry', async () => {
    state.premium = true;
    const { result, rerender } = setup(useChallenges);
    await waitFor(() => expect(result.current.allChallenges).toHaveLength(1));
    state.updateError = { message: 'premium_challenge_locked' };
    await act(async () => { await expect(result.current.checkIn('c1')).rejects.toMatchObject(state.updateError); });
    expect(result.current.allChallenges[0].completed_days).toEqual(['2026-09-01']);
    state.premium = false; rerender();
    expect(result.current.challenges).toEqual([]);
    expect(result.current.lockedChallenges[0].completed_days).toEqual(['2026-09-01']);
  });
});
