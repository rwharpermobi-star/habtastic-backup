import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePremium } from '@/hooks/usePremium';
import { todayStr } from '@/lib/habitStore';
import { syncProfileXpCache } from '@/hooks/profileCache';

export interface DbChallenge {
  id: string;
  user_id: string;
  title: string;
  description: string;
  emoji: string;
  duration: number;
  habit_name: string;
  start_date: string;
  completed_days: string[];
  reward_xp: number;
  reward_badge: string;
  created_at: string;
}

export function useChallenges() {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const queryClient = useQueryClient();
  const [allChallenges, setAllChallenges] = useState<DbChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChallenges = useCallback(async () => {
    if (!user) { setAllChallenges([]); setLoading(false); return; }
    const { data } = await supabase
      .from('challenges')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at');
    setAllChallenges((data as DbChallenge[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  const challenges = isPremium ? allChallenges : [];
  const lockedChallenges = isPremium ? [] : allChallenges;

  const isActive = (c: DbChallenge) => {
    const start = new Date(c.start_date);
    const daysPassed = Math.floor((Date.now() - start.getTime()) / 86400000);
    return daysPassed < c.duration && c.completed_days.length < c.duration;
  };

  const isComplete = (c: DbChallenge) => c.completed_days.length >= c.duration;

  const startChallenge = async (template: { title: string; description: string; emoji: string; duration: number; habitName: string; reward: { xp: number; badge: string } }) => {
    if (!user) return;
    if (!isPremium) throw new Error('Premium is required to continue saved challenges.');
    const { data, error } = await supabase.from('challenges').insert({
      user_id: user.id,
      title: template.title,
      description: template.description,
      emoji: template.emoji,
      duration: template.duration,
      habit_name: template.habitName,
      start_date: todayStr(),
      completed_days: [],
      reward_xp: template.reward.xp,
      reward_badge: template.reward.badge,
    }).select().single();
    if (error) throw error;
    if (data) setAllChallenges(prev => [...prev, data as DbChallenge]);
  };

  const checkIn = async (id: string) => {
    if (!isPremium) return false;
    const challenge = allChallenges.find(c => c.id === id);
    if (!challenge) return false;
    const today = todayStr();
    if (challenge.completed_days.includes(today)) return false;

    const newDays = [...challenge.completed_days, today];
    const { error } = await supabase.from('challenges').update({ completed_days: newDays }).eq('id', id);
    if (error) throw error;
    setAllChallenges(prev => prev.map(c => c.id === id ? { ...c, completed_days: newDays } : c));

    // Server-authoritative payout: complete_user_challenge re-verifies the
    // duration server-side and is idempotent via challenge_payouts unique key.
    if (newDays.length >= challenge.duration && user) {
      try {
        const { data, error } = await supabase.rpc('complete_user_challenge', { _challenge_id: id });
        if (error) throw error;
        const result = data as { xp?: number } | null;
        syncProfileXpCache(queryClient, user.id, Number(result?.xp ?? 0));
      } catch (e) {
        console.warn('[useChallenges] complete RPC failed', e);
        syncProfileXpCache(queryClient, user.id, 0);
      }
      return true;
    }
    return false;
  };

  return { challenges, allChallenges, lockedChallenges, loading, startChallenge, checkIn, isActive, isComplete, refetch: fetchChallenges };
}

