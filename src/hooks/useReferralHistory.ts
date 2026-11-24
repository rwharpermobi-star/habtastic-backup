import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface ReferralHistoryItem {
  id: string;
  referral_code: string;
  referred_id: string | null;
  purchase_completed: boolean;
  rewarded: boolean;
  reward_days: number;
  created_at: string;
  redeemed_at: string | null;
  friend_name: string | null;
}

export interface ReferralRewardHistoryItem {
  id: string;
  milestone: number;
  reward_kind: string;
  reward_days: number;
  qualified_count: number;
  premium_until_after: string | null;
  granted_at: string;
  xp_bonus: number;
  points_bonus: number;
}

export function useReferralHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [rewardHistory, setRewardHistory] = useState<ReferralRewardHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: refs, error: refsError } = await untypedSupabase
      .from('referrals_safe')
      .select('id, referral_code, referred_id, purchase_completed, rewarded, reward_days, created_at, redeemed_at')
      .eq('referrer_id', user.id)
      .not('referred_id', 'is', null)
      .order('created_at', { ascending: false });

    if (refsError) {
      console.warn('[useReferralHistory] fetch failed', refsError);
      setError("We couldn't load your referral history. Please check your connection and try again.");
      setLoading(false);
      return;
    }

    if (!refs) {
      setError(null);
      setHistory([]);
      setRewardHistory([]);
      setLoading(false);
      return;
    }

    const rows = refs as any[];
    const [rewardsResult, xpResult, pointsResult] = await Promise.all([
      untypedSupabase.from('referral_rewards')
        .select('id,milestone,reward_kind,reward_days,qualified_count,premium_until_after,granted_at')
        .eq('referrer_id', user.id)
        .order('granted_at', { ascending: false }),
      untypedSupabase.from('xp_transactions')
        .select('delta,metadata,created_at')
        .eq('user_id', user.id)
        .eq('reason', 'referral'),
      untypedSupabase.from('referral_points_ledger')
        .select('referral_id,milestone_count,points_delta,reason,created_at')
        .eq('user_id', user.id),
    ]);
    const xpRows = !xpResult.error ? (xpResult.data as any[] || []) : [];
    const pointRows = !pointsResult.error ? (pointsResult.data as any[] || []) : [];
    const rewards = !rewardsResult.error ? (rewardsResult.data as any[] || []) : [];
    const milestoneEvents = rewards.map(reward => ({
      ...reward,
      xp_bonus: xpRows.filter(row => Number(row.metadata?.milestone) === Number(reward.milestone))
        .reduce((sum, row) => sum + Number(row.delta || 0), 0),
      points_bonus: pointRows.filter(row => row.reason === 'milestone' && Number(row.milestone_count) === Number(reward.milestone))
        .reduce((sum, row) => sum + Number(row.points_delta || 0), 0),
    }));
    const signupEvents = rows.flatMap(referral => {
      const signupXp = xpRows.filter(row => row.metadata?.signup === true && row.metadata?.referral_id === referral.id);
      const signupPoints = pointRows.filter(row => row.reason === 'signup' && row.referral_id === referral.id);
      if (!signupXp.length && !signupPoints.length) return [];
      const timestamps = [...signupXp.map(row => row.created_at), ...signupPoints.map(row => row.created_at)]
        .filter(Boolean).sort();
      const grantedAt = timestamps[timestamps.length - 1] || referral.redeemed_at || referral.created_at;
      return [{
        id: `signup-${referral.id}`,
        milestone: 0,
        reward_kind: 'signup',
        reward_days: 0,
        qualified_count: 0,
        premium_until_after: null,
        granted_at: grantedAt,
        xp_bonus: signupXp.reduce((sum, row) => sum + Number(row.delta || 0), 0),
        points_bonus: signupPoints.reduce((sum, row) => sum + Number(row.points_delta || 0), 0),
      }];
    });
    setRewardHistory([...signupEvents, ...milestoneEvents].sort((a, b) =>
      new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime()
    ));

    // Best-effort enrichment with friend's display name from profiles (RLS may block; we degrade gracefully)
    const ids = rows.map(r => r.referred_id).filter((id): id is string => !!id);
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', ids);
      profs?.forEach(p => nameMap.set(p.user_id, p.name));
    }

    setError(null);
    setHistory(
      rows.map(r => ({
        ...r,
        friend_name: r.referred_id ? nameMap.get(r.referred_id) ?? null : null,
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchHistory();

    // Realtime: keep history in sync with referrals table changes.
    // Unique per-mount name avoids StrictMode double-mount reusing a
    // subscribed channel (which throws "cannot add postgres_changes callbacks
    // after subscribe()").
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(`referral-history:${user.id}:${Math.random().toString(36).slice(2)}`);
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'referrals',
            filter: `referrer_id=eq.${user.id}`,
          },
          () => {
            fetchHistory();
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[useReferralHistory] realtime status:', status);
          }
        });
    } catch (err) {
      console.warn('[useReferralHistory] realtime setup failed:', err);
    }

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
      }
    };
  }, [user, fetchHistory]);


  return { history, rewardHistory, loading, error, refetch: fetchHistory };
}
