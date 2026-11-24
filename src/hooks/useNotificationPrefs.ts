import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export type Tone = 'normal' | 'motivational' | 'strong';

export interface NotificationPrefs {
  user_id: string;
  timezone: string;
  default_tone: Tone;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  per_habit_enabled: boolean;
  missed_followups_enabled: boolean;
  comeback_enabled: boolean;
  streak_pressure_enabled: boolean;
  weekly_recap_enabled: boolean;
  weekly_recap_dow: number;
  weekly_recap_time: string;
  reward_toasts_enabled: boolean;
}

const DEFAULTS = (userId: string): NotificationPrefs => ({
  user_id: userId,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  default_tone: 'normal',
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '06:00',
  per_habit_enabled: true,
  missed_followups_enabled: true,
  comeback_enabled: true,
  streak_pressure_enabled: true,
  weekly_recap_enabled: true,
  weekly_recap_dow: 0,
  weekly_recap_time: '18:00',
  reward_toasts_enabled: true,
});

export function useNotificationPrefs() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notification_prefs', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await untypedSupabase
        .from('notification_prefs')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      let result: NotificationPrefs;
      if (data) result = data as unknown as NotificationPrefs;
      else {
        result = DEFAULTS(user.id);
        await untypedSupabase.from('notification_prefs').insert(result);
      }
      // Cache reward-toast pref locally so useHabits can read sync
      localStorage.setItem('habtastic-reward-toasts', result.reward_toasts_enabled ? '1' : '0');
      return result;
    },
    enabled: !!user,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const update = useCallback(async (updates: Partial<NotificationPrefs>) => {
    if (!user) return;
    if (typeof updates.reward_toasts_enabled === 'boolean') {
      localStorage.setItem('habtastic-reward-toasts', updates.reward_toasts_enabled ? '1' : '0');
    }
    qc.setQueryData(['notification_prefs', user.id], (prev: NotificationPrefs | null) =>
      prev ? { ...prev, ...updates } : prev
    );
    await untypedSupabase.from('notification_prefs').update(updates).eq('user_id', user.id);
  }, [user, qc]);

  return { prefs, loading: isLoading, update };
}
