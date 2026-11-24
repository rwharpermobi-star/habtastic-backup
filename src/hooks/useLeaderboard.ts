import { formatLocalDate } from '@/lib/habitStore';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useHabits, DbHabit } from '@/hooks/useHabits';

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0;
  let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (completions.includes(formatLocalDate(d))) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function getGrade(score: number): string {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  growth_score: number;
  grade: string;
  habits_completed: number;
  total_habits: number;
  best_streak: number;
  perfect_days: number;
  is_self: boolean;
  /** Long-term progression level (server-derived from XP). */
  level: number;
  /** Progression stars, 0-5, unlocked at levels 10/20/30/40/50. */
  stars: number;
}

export function useLeaderboard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { habits } = useHabits();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const myScore = useMemo(() => {
    if (!habits.length) return null;
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return formatLocalDate(d);
    });

    const dailyRates = last7.map(day => {
      const completed = habits.filter(h => h.completions.includes(day)).length;
      return { completed, total: habits.length, rate: habits.length > 0 ? Math.round((completed / habits.length) * 100) : 0 };
    });

    const avgRate = Math.round(dailyRates.reduce((s, d) => s + d.rate, 0) / 7);
    const perfectDays = dailyRates.filter(d => d.rate === 100).length;
    const totalCompleted = dailyRates.reduce((s, d) => s + d.completed, 0);
    const bestStreak = habits.reduce((max, h) => Math.max(max, getStreak(h.completions)), 0);
    const activeDays = dailyRates.filter(d => d.completed > 0).length;
    const level = Math.floor((profile?.xp || 0) / 100) + 1;

    const growthScore = Math.min(100, Math.round(
      (avgRate * 0.35) + (perfectDays * 8) + (bestStreak * 2.5) + (activeDays * 3) + (level * 2)
    ));

    return {
      growth_score: growthScore,
      grade: getGrade(growthScore),
      habits_completed: totalCompleted,
      total_habits: habits.length,
      best_streak: bestStreak,
      perfect_days: perfectDays,
    };
  }, [habits, profile?.xp]);

  // Submit own score — server recomputes Growth Score from habits.
  // The weekly_scores table is no longer client-writable, so the score
  // cannot be spoofed from the browser.
  const submitScore = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase.rpc('submit_weekly_score');
    if (error) console.error('Submit score error:', error);
  }, [user]);

  // Load leaderboard
  const loadLeaderboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStart = getWeekStart();

    const { data, error } = await supabase
      .from('weekly_scores')
      .select('*')
      .eq('week_start', weekStart)
      .order('score', { ascending: false })
      .limit(50);

    if (!error && data) {
      // Fetch server-derived level/stars for the visible users in one round-trip.
      const ids = Array.from(new Set(data.map((e) => e.user_id).filter(Boolean)));
      const progression = new Map<string, { level: number; stars: number }>();
      if (ids.length) {
        const { data: prog } = await supabase.rpc('get_progression_for_users', { _user_ids: ids });
        (prog || []).forEach((p) => progression.set(p.user_id, { level: p.level, stars: p.stars }));
      }

      setEntries(data.map((e) => ({
        user_id: e.user_id,
        display_name: e.display_name,
        avatar_url: e.avatar_url,
        growth_score: e.growth_score,
        grade: e.grade,
        habits_completed: e.habits_completed,
        total_habits: e.total_habits,
        best_streak: e.best_streak,
        perfect_days: e.perfect_days,
        is_self: e.user_id === user.id,
        level: progression.get(e.user_id)?.level ?? 1,
        stars: progression.get(e.user_id)?.stars ?? 0,
      })));
    }
    setLoading(false);
  }, [user]);

  const didInitialLoad = useRef(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    if (!myScore) {
      loadLeaderboard();
      return;
    }

    // First run: submit + load immediately so the user sees the board.
    if (!didInitialLoad.current) {
      didInitialLoad.current = true;
      submitScore().then(() => loadLeaderboard());
      return;
    }

    // Subsequent score changes (e.g. habit toggles): debounce DB writes.
    if (submitTimer.current) clearTimeout(submitTimer.current);
    submitTimer.current = setTimeout(() => {
      submitScore().then(() => loadLeaderboard());
    }, 4000);

    return () => {
      if (submitTimer.current) clearTimeout(submitTimer.current);
    };
  }, [user, myScore, submitScore, loadLeaderboard]);

  return { entries, loading, myScore, refresh: loadLeaderboard };
}
