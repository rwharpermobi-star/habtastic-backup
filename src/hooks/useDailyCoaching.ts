import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePremium } from '@/hooks/usePremium';
import { toast } from 'sonner';

export interface AtRiskHabit {
  id: string;
  name: string;
  emoji: string;
  rate: number;
  days_active: number;
}

export interface SuggestedChallenge {
  title: string;
  description: string;
  duration_days: number;
  target_habit_id?: string | null;
  reward_xp?: number | null;
  reward_coins?: number | null;
}

export interface DailyCoaching {
  id: string;
  user_id: string;
  coaching_date: string;
  message: string;
  recommendations: string[];
  engagement_score: number;
  completion_rate_7d: number;
  best_streak: number;
  at_risk_habits: AtRiskHabit[];
  suggested_challenge: SuggestedChallenge | null;
  model: string | null;
  created_at: string;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function useDailyCoaching() {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const [coaching, setCoaching] = useState<DailyCoaching | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const triedRef = useRef(false);

  const fetchLatest = useCallback(async () => {
    if (!user || !isPremium) { setCoaching(null); setLoading(false); return null; }
    const { data } = await supabase
      .from('ai_daily_coaching')
      .select('*')
      .eq('user_id', user.id)
      .eq('coaching_date', today())
      .maybeSingle();
    setCoaching((data as unknown as DailyCoaching | null) ?? null);
    setLoading(false);
    return (data as unknown as DailyCoaching | null) ?? null;
  }, [user, isPremium]);

  const generate = useCallback(async (force = false) => {
    if (!user || !isPremium || generating) return null;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('winston-coach-daily', { body: { force } });
      if (error) {
        const status = (error)?.context?.status;
        if (status === 429) toast.error('Winston is busy — try again in a moment.');
        else if (status === 402) toast.error('AI credits exhausted.');
        else toast.error("Couldn't refresh Winston's coaching.");
        return null;
      }
      if (data?.coaching) {
        setCoaching(data.coaching as DailyCoaching);
        return data.coaching as DailyCoaching;
      }
      return null;
    } finally {
      setGenerating(false);
    }
  }, [user, isPremium, generating]);

  // First visit of the day → auto-generate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await fetchLatest();
      if (cancelled || !user || !isPremium || triedRef.current) return;
      if (!latest) {
        triedRef.current = true;
        void generate(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, isPremium, fetchLatest, generate]);

  return { coaching, loading, generating, generate, refetch: fetchLatest };
}

