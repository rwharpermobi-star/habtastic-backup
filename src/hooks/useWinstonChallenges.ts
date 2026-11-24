import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { syncProfileXpCache } from '@/hooks/profileCache';
import { edgeFunctionFetch } from '@/lib/edgeFunctionFetch';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface WinstonChallenge {
  id: string;
  user_id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'expired';
  reward_xp: number;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export function useWinstonChallenges() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const [challenges, setChallenges] = useState<WinstonChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setChallenges([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('winston_challenges')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setChallenges((data as unknown as WinstonChallenge[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const active = challenges.find(
    c => (c.status === 'pending' || c.status === 'accepted') &&
      (!c.expires_at || new Date(c.expires_at).getTime() > Date.now())
  );

  const generate = useCallback(
    async (input: { language?: { code: string } }) => {
      if (!session) return null;
      setGenerating(true);
      try {
        const resp = await edgeFunctionFetch('winston-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Failed (${resp.status})`);
        }
        const data = await resp.json();
        const ch = data.challenge as WinstonChallenge;
        setChallenges(prev => [ch, ...prev]);
        return ch;
      } finally {
        setGenerating(false);
      }
    },
    [session]
  );

  const accept = useCallback(async (id: string) => {
    await untypedSupabase.rpc('respond_winston_challenge', { _challenge_id: id, _accept: true });
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, status: 'accepted' } : c));
  }, []);

  const decline = useCallback(async (id: string) => {
    await untypedSupabase.rpc('respond_winston_challenge', { _challenge_id: id, _accept: false });
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, status: 'declined' } : c));
  }, []);

  const complete = useCallback(async (id: string) => {
    if (!user) return null;
    const ch = challenges.find(c => c.id === id);
    if (!ch) return null;
    // Server-authoritative: re-validates ownership/status/expiry and awards
    // XP via award_xp (capped & idempotent via challenge_payouts).
    const { data, error } = await supabase.rpc('complete_winston_challenge', { _challenge_id: id });
    if (error) {
      console.warn('[useWinstonChallenges] complete RPC failed', error);
      syncProfileXpCache(queryClient, user.id, 0);
      return null;
    }
    const result = data as { xp?: number } | null;
    syncProfileXpCache(queryClient, user.id, Number(result?.xp ?? 0));
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, status: 'completed', completed_at: new Date().toISOString() } : c));
    return ch;
  }, [user, challenges, queryClient]);

  return { challenges, active, loading, generating, generate, accept, decline, complete, refetch: fetchAll };
}
