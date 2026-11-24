import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { usePremium } from '@/hooks/usePremium';
import { supabase } from '@/integrations/supabase/client';
import { todayStr } from '@/lib/habitStore';
import { toast } from 'sonner';

const MAX_FREEZES = 3; // Premium users can hold 3 shields at once
const FREEZE_COST_XP = 50; // Mirrors the cost enforced in buy_streak_shield()

/** Human copy for the error codes raised by the server RPCs. */
const ERROR_COPY: Record<string, string> = {
  premium_required: 'Streak Shields are a Premium feature.',
  no_shields_available: "You don't have any Streak Shields left.",
  already_shielded: 'That day is already shielded.',
  weekly_limit_reached: 'You have used both Streak Shields for this week.',
  max_shields_held: `You can hold up to ${MAX_FREEZES} shields.`,
  insufficient_xp: `You need ${FREEZE_COST_XP} XP to buy a Streak Shield.`,
  invalid_date: 'That day can no longer be shielded.',
};

function copyFor(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  const key = Object.keys(ERROR_COPY).find((k) => message.includes(k));
  return key ? ERROR_COPY[key] : fallback;
}

export function useStreakFreeze() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isPremium } = usePremium();
  const queryClient = useQueryClient();

  const freezesAvailable = profile?.streak_freezes ?? 0;
  const freezeUsedDates = profile?.freeze_used_dates ?? [];
  const todayFrozen = freezeUsedDates.includes(todayStr());

  const canFreeze = isPremium && freezesAvailable > 0 && !todayFrozen;

  const refresh = useCallback(() => {
    if (user) queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
  }, [queryClient, user]);

  /**
   * Activation is fully server-side: `use_streak_shield` re-checks Premium,
   * the held count, the rolling weekly limit and the target date, then
   * decrements. The client never writes streak_freezes/freeze_used_dates.
   */
  const useFreeze = useCallback(async () => {
    if (!user) return false;
    const { data, error } = await supabase.rpc('use_streak_shield' as never, { _date: null } as never);
    if (error) {
      toast.error(copyFor(error.message, 'Could not activate Streak Shield'));
      return false;
    }
    refresh();
    // Some declines come back as a payload rather than an error.
    const result = (data ?? {}) as { ok?: boolean; reason?: string };
    if (result.ok === false) {
      toast.error(copyFor(result.reason, 'Could not activate Streak Shield'));
      return false;
    }
    toast.success('❄️ Streak Freeze Activated!', {
      description: "Your streak is protected today. You won't lose progress.",
    });
    return true;
  }, [user, refresh]);

  const buyFreezeWithXP = useCallback(async () => {
    if (!user) return false;
    const { data, error } = await supabase.rpc('buy_streak_shield' as never, {} as never);
    if (error) {
      toast.error(copyFor(error.message, 'Could not purchase Streak Shield'));
      return false;
    }
    refresh();
    const held = Number((data as { shields?: number } | null)?.shields ?? freezesAvailable + 1);
    toast.success('❄️ Streak Freeze Purchased!', {
      description: `Used ${FREEZE_COST_XP} XP. You now have ${held} freeze(s).`,
    });
    return true;
  }, [user, refresh, freezesAvailable]);

  return {
    freezesAvailable,
    todayFrozen,
    canFreeze,
    isPremium,
    useFreeze,
    buyFreezeWithXP,
    MAX_FREEZES,
    FREEZE_COST_XP,
  };
}
