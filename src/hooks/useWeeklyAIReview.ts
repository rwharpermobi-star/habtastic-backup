import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePremium } from '@/hooks/usePremium';
import { toast } from 'sonner';

export interface WeeklyAIReview {
  id: string;
  user_id: string;
  week_start: string;
  summary: string;
  weak_points: string;
  suggestion: string;
  completion_rate: number;
  prev_completion_rate: number | null;
  best_day: string | null;
  worst_day: string | null;
  morning_count: number;
  evening_count: number;
  habits_total: number;
  habits_completed: number;
  model: string | null;
  created_at: string;
}

const NOTIFY_KEY = 'weekly-ai-review:notified';

function startOfWeekISO(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = (day + 6) % 7;
  const ws = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
  return ws.toISOString().split('T')[0];
}

export function useWeeklyAIReview() {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const [review, setReview] = useState<WeeklyAIReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const triedAutoGenRef = useRef(false);

  const fetchLatest = useCallback(async () => {
    if (!user || !isPremium) {
      setReview(null);
      setLoading(false);
      return null;
    }
    const { data, error } = await supabase
      .from('ai_weekly_reviews')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.warn('[weekly-ai-review] fetch error', error);
    setReview((data as unknown as WeeklyAIReview | null) ?? null);
    setLoading(false);
    return (data as unknown as WeeklyAIReview | null) ?? null;
  }, [user, isPremium]);

  const generate = useCallback(
    async (force = false) => {
      if (!user || !isPremium || generating) return null;
      setGenerating(true);
      try {
        const { data, error } = await supabase.functions.invoke('weekly-ai-review', {
          body: { force },
        });
        if (error) {
          const status = (error)?.context?.status;
          const body = (error)?.context?.body;
          const isNoHabits =
            status === 400 &&
            (typeof body === 'string' ? body.includes('no_habits') : body?.error === 'no_habits');
          if (isNoHabits) return null;
          if (status === 401) return null; // stale/missing session — handled by AuthContext
          if (status === 429) toast.error('Winston is busy — try again in a moment.');
          else if (status === 402) toast.error('AI credits exhausted. Add funds to keep using Winston.');
          else toast.error('Could not generate weekly review');
          return null;
        }
        if (data?.review) {
          setReview(data.review as WeeklyAIReview);

          // Notify only the first time the user sees this week's review
          const weekKey = data.review.week_start;
          const lastNotified = localStorage.getItem(NOTIFY_KEY);
          if (lastNotified !== weekKey && !data.cached) {
            localStorage.setItem(NOTIFY_KEY, weekKey);
            toast.success('Your weekly review is ready', {
              description: 'Winston has fresh insights for you.',
            });
          }
          return data.review as WeeklyAIReview;
        }
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [user, isPremium, generating],
  );

  // Initial fetch + auto-generate when 7+ days have passed
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await fetchLatest();
      if (cancelled) return;
      if (!user || !isPremium || triedAutoGenRef.current) return;
      const currentWeek = startOfWeekISO();
      if (!latest || latest.week_start !== currentWeek) {
        // Skip the call entirely for users with no habits — function returns 400.
        const { count } = await supabase
          .from('habits')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (cancelled) return;
        if (!count || count === 0) return;
        triedAutoGenRef.current = true;
        // background — non-blocking
        void generate(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isPremium, fetchLatest, generate]);

  return { review, loading, generating, generate, refetch: fetchLatest };
}

