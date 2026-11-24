import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useHabits } from '@/hooks/useHabits';
import { formatLocalDate, todayStr } from '@/lib/habitStore';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/**
 * Streak Saver — auto-applies a free "save" when the user missed YESTERDAY only.
 * Rules:
 *  - Free for everyone (separate from Premium "Streak Shield" that's manually used)
 *  - Max 2 saves per rolling 7-day window
 *  - Only saves a SINGLE missed day; if 2+ days missed in a row → no save
 *  - Respects user toggle: localStorage 'streak-saver-enabled' ('1' | '0', default '1')
 *  - Stored in profiles.freeze_used_dates so it integrates with existing streak math
 *  - One auto-attempt per session per user
 */

export const STREAK_SAVER_RULES = {
  MAX_PER_WEEK: 2,
  TOGGLE_KEY: 'streak-saver-enabled',
  ATTEMPT_SESSION_KEY: 'streak-saver-attempted',
};

export function isStreakSaverEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(STREAK_SAVER_RULES.TOGGLE_KEY);
  return v === null ? true : v === '1';
}

export function setStreakSaverEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STREAK_SAVER_RULES.TOGGLE_KEY, enabled ? '1' : '0');
}

function isoDay(d: Date): string {
  return formatLocalDate(d);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDay(d);
}

function dayBeforeYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 2);
  return isoDay(d);
}

/** Count saves used in the last 7 days */
export function getSaversUsedThisWeek(usedDates: string[]): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  return usedDates.filter((d) => new Date(d + 'T00:00:00').getTime() >= cutoff.getTime()).length;
}

export function getSaversAvailable(usedDates: string[]): number {
  return Math.max(0, STREAK_SAVER_RULES.MAX_PER_WEEK - getSaversUsedThisWeek(usedDates));
}

/**
 * React hook — runs once per session and auto-applies a Streak Saver if conditions match.
 */
export function useStreakSaver() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const refreshProfile = useCallback(async () => {
    if (user) await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
  }, [queryClient, user]);

  const { habits, loading: habitsLoading } = useHabits();
  const triedRef = useRef(false);

  useEffect(() => {
    if (!user || !profile || habitsLoading) return;
    if (triedRef.current) return;
    if (!isStreakSaverEnabled()) return;
    if (!habits.length) return;

    // Only attempt once per session
    const sessionKey = `${STREAK_SAVER_RULES.ATTEMPT_SESSION_KEY}:${user.id}:${todayStr()}`;
    if (sessionStorage.getItem(sessionKey)) {
      triedRef.current = true;
      return;
    }

    const usedDates = profile.freeze_used_dates ?? [];
    const yesterday = yesterdayStr();
    const dayBefore = dayBeforeYesterdayStr();

    // Already saved yesterday — nothing to do
    if (usedDates.includes(yesterday)) {
      triedRef.current = true;
      sessionStorage.setItem(sessionKey, '1');
      return;
    }

    // Cap: max 2 per week
    if (getSaversUsedThisWeek(usedDates) >= STREAK_SAVER_RULES.MAX_PER_WEEK) {
      triedRef.current = true;
      sessionStorage.setItem(sessionKey, '1');
      return;
    }

    // Detect: did the user have any active streak that broke yesterday?
    // Requires: at least one habit completed on dayBefore but NOT on yesterday.
    // AND day-before-yesterday must not itself have been saved (prevents stacking).
    const someBrokenSingleDay = habits.some((h) => {
      const c = h.completions || [];
      const completedDayBefore = c.includes(dayBefore) || usedDates.includes(dayBefore);
      const missedYesterday = !c.includes(yesterday);
      return completedDayBefore && missedYesterday;
    });

    if (!someBrokenSingleDay) {
      triedRef.current = true;
      sessionStorage.setItem(sessionKey, '1');
      return;
    }

    // Apply the save server-side. `auto_save_streak_day` re-validates the
    // rolling weekly limit and the target date before touching
    // profiles.freeze_used_dates — the client cannot write that column.
    triedRef.current = true;
    sessionStorage.setItem(sessionKey, '1');

    (async () => {
      try {
        const { data, error } = await supabase.rpc('auto_save_streak_day' as never, {
          _date: yesterday,
        } as never);
        if (error) throw error;
        const result = (data ?? {}) as { ok?: boolean; reason?: string };
        await refreshProfile();
        // The server can decline without erroring (already saved / weekly cap).
        if (result.ok === false) {
          console.log('[streak-saver] declined by server:', result.reason);
          return;
        }
        toast.success('🛡️ Streak saved. Stay consistent.', {
          description: `Used 1 of ${STREAK_SAVER_RULES.MAX_PER_WEEK} weekly Streak Savers.`,
        });
      } catch (e) {
        console.warn('[streak-saver] failed to apply', e);
      }
    })();
  }, [user, profile, habits, habitsLoading, refreshProfile]);


  const usedDates = profile?.freeze_used_dates ?? [];
  return {
    available: getSaversAvailable(usedDates),
    usedThisWeek: getSaversUsedThisWeek(usedDates),
    max: STREAK_SAVER_RULES.MAX_PER_WEEK,
    enabled: isStreakSaverEnabled(),
  };
}
