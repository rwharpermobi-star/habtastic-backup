import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface CommunityChallenge {
  id: string;
  kind: 'daily' | 'weekly' | 'monthly' | 'event';
  title: string;
  description: string;
  emoji: string;
  target_type: string;
  target_value: number;
  reward_xp: number;
  reward_coins: number;
  start_date: string;
  end_date: string;
  participation?: {
    progress: number;
    completed_at: string | null;
    claimed_at: string | null;
  };
  participant_count: number;
}

export function useCommunityChallenges() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<CommunityChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: ch } = await supabase
      .from('community_challenges')
      .select('*')
      .eq('is_active', true)
      .gte('end_date', today)
      .order('kind', { ascending: true });

    if (!ch || ch.length === 0) { setChallenges([]); setLoading(false); return; }

    const ids = ch.map((c) => c.id);
    const { data: parts } = await supabase
      .from('community_challenge_participants')
      .select('challenge_id, user_id, progress, completed_at, claimed_at')
      .in('challenge_id', ids);

    const counts: Record<string, number> = {};
    const mine: Record<string, any> = {};
    parts?.forEach((p: any) => {
      counts[p.challenge_id] = (counts[p.challenge_id] || 0) + 1;
      if (user && p.user_id === user.id) mine[p.challenge_id] = p;
    });

    setChallenges(ch.map((c: any) => ({
      ...c,
      participant_count: counts[c.id] || 0,
      participation: mine[c.id],
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const join = useCallback(async (id: string) => {
    const { error } = await supabase.rpc('join_community_challenge', { _challenge_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success('Joined! 🎯');
    await load();
  }, [load]);

  const updateProgress = useCallback(async (id: string, progress: number) => {
    const { error } = await supabase.rpc('update_community_challenge_progress', {
      _challenge_id: id, _delta: progress,
    });
    if (error) toast.error(error.message);
    await load();
  }, [load]);

  const claim = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc('claim_community_challenge', { _challenge_id: id });
    if (error) { toast.error(error.message); return; }
    const result = data as any;
    toast.success(`+${result?.xp || 0} XP 🏆`);
    await load();
  }, [load]);

  return { challenges, loading, join, updateProgress, claim, refresh: load };
}
