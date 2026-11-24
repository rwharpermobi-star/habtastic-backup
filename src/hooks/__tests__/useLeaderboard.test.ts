import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import type { DbHabit } from '@/hooks/useHabits';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' },
  profile: { xp: 0 },
  habits: [] as DbHabit[],
  query: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: mocks.profile }) }));
vi.mock('@/hooks/useHabits', () => ({ useHabits: () => ({ habits: mocks.habits }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: mocks.query }) }) }) }),
    rpc: mocks.rpc,
  },
}));

describe('leaderboard loading', () => {
  beforeEach(() => {
    mocks.habits = [];
    mocks.query.mockReset().mockResolvedValue({ data: [], error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  });
  afterEach(cleanup);

  it('settles into the empty state without submitting a score for a user with no habits', async () => {
    const { result } = renderHook(useLeaderboard);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.myScore).toBeNull();
    expect(result.current.entries).toEqual([]);
  });

  it('loads other users even without a personal score', async () => {
    mocks.query.mockResolvedValue({ data: [{ user_id: 'other', display_name: 'Other' }], error: null });
    const { result } = renderHook(useLeaderboard);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries[0]).toMatchObject({ user_id: 'other', is_self: false });
    expect(mocks.rpc).not.toHaveBeenCalledWith('submit_weekly_score');
  });

  it('clears loading when the board query returns an error', async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    const { result } = renderHook(useLeaderboard);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it('still submits before loading when the user has habits', async () => {
    mocks.habits = [{ completions: [] } as DbHabit];
    const { result } = renderHook(useLeaderboard);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.rpc).toHaveBeenCalledWith('submit_weekly_score');
    expect(mocks.query).toHaveBeenCalledOnce();
  });
});
