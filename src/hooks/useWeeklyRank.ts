import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WeeklyRank {
  /** 1-based rank for the current week, or null when the user has no score yet. */
  rank: number | null;
  /** Number of ranked players this week. */
  total: number;
}

/** Monday (local) of the current week, as an ISO date string. */
function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

/**
 * Read-only weekly rank for the signed-in user. Deliberately does not submit or
 * recompute scores (that stays in useLeaderboard) so it is cheap enough to
 * render on the Home page.
 */
export function useMyWeeklyRank() {
  const { user } = useAuth();
  const weekStart = getWeekStart();

  return useQuery({
    queryKey: ['my-weekly-rank', user?.id, weekStart],
    queryFn: async (): Promise<WeeklyRank> => {
      if (!user) return { rank: null, total: 0 };

      const { data: mine } = await supabase
        .from('weekly_scores')
        .select('score')
        .eq('week_start', weekStart)
        .eq('user_id', user.id)
        .maybeSingle();

      const { count: total } = await supabase
        .from('weekly_scores')
        .select('user_id', { count: 'exact', head: true })
        .eq('week_start', weekStart);

      const myScore = (mine as { score: number } | null)?.score;
      if (myScore === undefined || myScore === null) {
        return { rank: null, total: total ?? 0 };
      }

      const { count: ahead } = await supabase
        .from('weekly_scores')
        .select('user_id', { count: 'exact', head: true })
        .eq('week_start', weekStart)
        .gt('score', myScore);

      return { rank: (ahead ?? 0) + 1, total: total ?? 0 };
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}
