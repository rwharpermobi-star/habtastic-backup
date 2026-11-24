import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { syncProfileRewardCache } from '@/hooks/profileCache';

export interface AIChallenge {
  id: string;
  user_id: string;
  title: string;
  description: string;
  target_habit_id: string | null;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  reward_xp: number;
  reward_coins: number;
  completed_at: string | null;
  created_at: string;
}

export function useAIChallenges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<AIChallenge | null>(null);
  const [history, setHistory] = useState<AIChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) { setActive(null); setHistory([]); setLoading(false); return; }
    const { data } = await supabase
      .from('ai_challenges')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const rows = (data as unknown as AIChallenge[]) ?? [];
    setActive(rows.find(r => r.status === 'active') ?? null);
    setHistory(rows.filter(r => r.status !== 'active'));
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  const accept = useCallback(async () => {
    if (!user || busy) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('accept_ai_challenge');
      if (error) {
        if (error.message?.includes('already_active')) toast.error('You already have an active Winston challenge.');
        else if (error.message?.includes('no_suggested')) toast.error('No challenge suggested today.');
        else toast.error("Couldn't start the challenge.");
        return null;
      }
      toast.success('Challenge accepted — let\'s go 🦊');
      await refetch();
      return data as unknown as AIChallenge;
    } finally {
      setBusy(false);
    }
  }, [user, busy, refetch]);

  const complete = useCallback(async (id: string) => {
    if (!user || busy) return null;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('complete_ai_challenge', { _challenge_id: id });
      if (error) {
        if (error.message?.includes('incomplete_progress')) toast.error('Not quite done yet — keep going!');
        else toast.error("Couldn't complete the challenge.");
        return null;
      }
      const ch = data as unknown as AIChallenge;
      syncProfileRewardCache(queryClient, user.id, { xp: ch.reward_xp });
      toast.success(`Challenge complete! +${ch.reward_xp} XP`);
      await refetch();
      return ch;
    } finally {
      setBusy(false);
    }
  }, [user, busy, refetch, queryClient]);

  return { active, history, loading, busy, accept, complete, refetch };
}
