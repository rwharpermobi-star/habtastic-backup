import type { QueryClient } from '@tanstack/react-query';
import type { Profile } from '@/hooks/useProfile';

export const profileQueryKey = (userId: string | null | undefined) => ['profile', userId] as const;

export function syncProfileXpCache(queryClient: QueryClient, userId: string | null | undefined, delta: number) {
  if (!userId) return;
  if (delta !== 0) {
    queryClient.setQueryData<Profile | null>(profileQueryKey(userId), (prev) =>
      prev ? { ...prev, xp: Math.max(0, (prev.xp ?? 0) + delta) } : prev,
    );
  }
  void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId), exact: true });
}

export function syncProfileRewardCache(
  queryClient: QueryClient,
  userId: string | null | undefined,
  reward: { xp?: number; coins?: number },
) {
  if (!userId) return;
  const xpDelta = Number(reward.xp ?? 0);
  const coinDelta = Number(reward.coins ?? 0);
  if (xpDelta !== 0 || coinDelta !== 0) {
    queryClient.setQueryData<Profile | null>(profileQueryKey(userId), (prev) =>
      prev
        ? {
            ...prev,
            xp: Math.max(0, (prev.xp ?? 0) + xpDelta),
            coins: Math.max(0, (prev.coins ?? 0) + coinDelta),
          }
        : prev,
    );
  }
  void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId), exact: true });
}