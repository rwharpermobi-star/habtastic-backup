import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { todayStr } from '@/lib/habitStore';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface ChestReward {
  reward_type: 'coins' | 'streak_shield' | 'streak_saver' | 'double_xp_24h' | 'premium_day_pass';
  reward_value: number;
}

export interface DailyChestRow {
  user_id: string;
  opened_on: string;
  reward_type: ChestReward['reward_type'];
  reward_value: number;
  opened_at: string;
}

export function useDailyChest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const today = todayStr();
  const { data: todaysChest = null, isLoading } = useQuery({
    queryKey: ['daily-chest', user?.id, today],
    queryFn: async (): Promise<DailyChestRow | null> => {
      if (!user) return null;
      const { data } = await untypedSupabase
        .from('daily_chests')
        .select('*')
        .eq('user_id', user.id)
        .eq('opened_on', today)
        .maybeSingle();
      return (data as unknown as DailyChestRow) ?? null;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const openChest = useCallback(async (): Promise<ChestReward> => {
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await untypedSupabase.rpc('open_daily_chest');
    if (error) {
      if (error.message.toLowerCase().includes('chest already opened today')) {
        // The cached status may be stale; refresh it and show a friendly message.
        await queryClient.invalidateQueries({ queryKey: ['daily-chest', user.id, today] });
        throw new Error("You've already opened today's chest. Come back tomorrow.");
      }
      throw error;
    }
    const reward = data as unknown as ChestReward;
    queryClient.invalidateQueries({ queryKey: ['daily-chest', user.id, today] });
    queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
    queryClient.invalidateQueries({ queryKey: ['coin-history', user.id] });
    return reward;
  }, [user, queryClient, today]);

  return { todaysChest, isLoading, opened: !!todaysChest, openChest };
}
