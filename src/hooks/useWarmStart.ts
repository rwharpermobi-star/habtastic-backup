import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/integrations/supabase/lazyClient';
import { habitsQueryKey } from '@/hooks/habitKeys';
import type { DbHabit } from '@/hooks/useHabits';

const HABIT_FIELDS = 'id, user_id, name, emoji, color, frequency, category, difficulty, reminder_time, reminder_enabled, reminder_tone, custom_days, completions, sound_mode, verification_enabled, verification_question, created_at';

export function useWarmStart(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    void queryClient.prefetchQuery({
      queryKey: habitsQueryKey(userId),
      queryFn: async () => {
        const { data, error } = await (await getSupabase())
          .from('habits')
          .select(HABIT_FIELDS)
          .eq('user_id', userId)
          .order('created_at');
        if (error) throw error;
        return (data ?? []) as DbHabit[];
      },
      staleTime: 60_000,
    });

    const warmChunks = () => {
      void import('@/pages/Dashboard');
      void import('@/pages/Habits');
    };
    const idle = (window).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    const handle = idle ? idle(warmChunks, { timeout: 2000 }) : window.setTimeout(warmChunks, 300);
    return () => {
      const cancelIdle = (window).cancelIdleCallback as ((h: number) => void) | undefined;
      if (idle && cancelIdle) cancelIdle(handle);
      else clearTimeout(handle);
    };
  }, [userId, queryClient]);
}
