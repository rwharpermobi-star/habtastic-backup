import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { getLevelFromXP } from '@/lib/progression';
import { profileQueryKey, syncProfileXpCache } from '@/hooks/profileCache';
import type { Profile } from '@/hooks/useProfile';

const baseProfile: Profile = {
  name: 'XP Tester',
  coach_gender: 'male',
  xp: 0,
  theme: 'default',
  onboarding_complete: true,
  avatar_url: null,
  is_premium: false,
  premium_until: null,
  daily_ai_messages: 0,
  last_ai_reset: null,
  streak_freezes: 0,
  freeze_used_dates: [],
  coins: 0,
  gems: 0,
  unlocked_themes: [],
  unlocked_effects: [],
  ai_avatar_credits_used: 0,
  ai_avatar_credits_reset_at: new Date(0).toISOString(),
  trial_started_at: null,
};

function setupProfileCache(startingXp = 0) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const userId = 'user-xp-sync';
  queryClient.setQueryData(profileQueryKey(userId), { ...baseProfile, xp: startingXp });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  return { queryClient, userId, invalidateSpy };
}

describe('XP sync cache updates', () => {
  it('awarding +10 XP changes profiles.xp cache by exactly +10', () => {
    const { queryClient, userId } = setupProfileCache(0);

    syncProfileXpCache(queryClient, userId, 10);

    expect(queryClient.getQueryData<Profile>(profileQueryKey(userId))?.xp).toBe(10);
  });

  it('awarding +80 challenge XP changes profiles.xp cache by exactly +80', () => {
    const { queryClient, userId } = setupProfileCache(25);

    syncProfileXpCache(queryClient, userId, 80);

    expect(queryClient.getQueryData<Profile>(profileQueryKey(userId))?.xp).toBe(105);
  });

  it('repeating a deduped award does not increment twice', () => {
    const { queryClient, userId } = setupProfileCache(0);

    syncProfileXpCache(queryClient, userId, 80);
    syncProfileXpCache(queryClient, userId, 0);

    expect(queryClient.getQueryData<Profile>(profileQueryKey(userId))?.xp).toBe(80);
  });

  it('getLevelFromXP immediately reflects the new total', () => {
    const { queryClient, userId } = setupProfileCache(70);

    syncProfileXpCache(queryClient, userId, 10);
    const nextXp = queryClient.getQueryData<Profile>(profileQueryKey(userId))?.xp ?? 0;

    expect(getLevelFromXP(nextXp).level).toBe(2);
    expect(getLevelFromXP(nextXp).xpCurrent).toBe(5);
  });

  it('invalidates the exact profile query after a successful XP award', () => {
    const { queryClient, userId, invalidateSpy } = setupProfileCache(0);

    syncProfileXpCache(queryClient, userId, 10);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileQueryKey(userId), exact: true });
  });
});