import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { untypedSupabase } from "@/integrations/supabase/untyped";

// Kept for compatibility with existing referral-card consumers. Rewards are
// milestone-based now rather than granted per individual referral.
const REWARD_DAYS_PER_REFERRAL = 7;

// Rewards are earned ONLY when an invited friend becomes a server-verified
// paid Premium subscriber. Granting happens in the `qualify_referral_payment`
// SQL function, triggered from the Paystack webhook / verify Edge Functions.
// Milestones are one-time rewards at 1, 3, 10 and 20 qualified paid referrals
// (7 days, 30 days, 90 days, lifetime Premium). The server is the source of truth.
export const DEFAULT_MILESTONES = [
  {
    count: 1,
    bonusDays: 7,
    lifetime: false,
    bonusXP: 0,
    bonusCoins: 0,
    badge: 'Referral Starter',
    emoji: '🎁',
    label: '7 Days Premium',
    rewards: [
      '7 Days Free Premium',
      'Unlocked at 1 qualified paid referral',
      'Added automatically when the milestone is reached',
    ],
  },
  {
    count: 3,
    bonusDays: 30,
    lifetime: false,
    bonusXP: 0,
    bonusCoins: 0,
    badge: 'Referral Pro',
    emoji: '🚀',
    label: '30 Days Premium',
    rewards: [
      '30 Days Free Premium',
      'Unlocked at 3 qualified paid referrals',
      'Stacks on top of your current expiry',
    ],
  },
  {
    count: 10,
    bonusDays: 90,
    lifetime: false,
    bonusXP: 0,
    bonusCoins: 0,
    badge: 'Referral Champion',
    emoji: '🏅',
    label: '90 Days Premium',
    rewards: [
      '90 Days Free Premium',
      'Unlocked at 10 qualified paid referrals',
      'Stacks on top of your current expiry',
    ],
  },
  {
    count: 20,
    bonusDays: 0,
    lifetime: true,
    bonusXP: 0,
    bonusCoins: 0,
    badge: 'Legendary Referrer',
    emoji: '🏆',
    label: 'Lifetime Premium',
    rewards: [
      'Lifetime Premium',
      'Unlocked at 20 qualified paid referrals',
      'Never expires',
    ],
  },
];

const MILESTONE_STYLE: Record<number, { badge: string; emoji: string }> = Object.fromEntries(
  DEFAULT_MILESTONES.map(m => [m.count, { badge: m.badge, emoji: m.emoji }]),
);

export function milestoneFromRow(row) {
  const count = Number(row.milestone_count);
  const days = Number(row.premium_days || 0);
  const lifetime = Boolean(row.lifetime);
  const style = MILESTONE_STYLE[count] ?? { badge: 'Referral Milestone', emoji: '🎁' };
  return {
    count,
    bonusDays: days,
    lifetime,
    bonusXP: Number(row.xp_bonus || 0),
    bonusCoins: Number(row.points_bonus || 0),
    badge: style.badge,
    emoji: style.emoji,
    label: lifetime ? 'Lifetime Premium' : days > 0 ? `${days} Days Premium` : 'Referral Reward',
    rewards: [
      lifetime ? 'Lifetime Premium' : days > 0 ? `${days} Days Free Premium` : 'Referral milestone reward',
      `Unlocked at ${count} qualified paid referral${count === 1 ? '' : 's'}`,
      lifetime ? 'Never expires' : 'Rewards are issued by HabTastic after verification',
    ],
  };
}


export function useReferral() {
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [paidReferralCount, setPaidReferralCount] = useState(0);
  const [totalDaysEarned, setTotalDaysEarned] = useState(0);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [milestones, setMilestones] = useState(DEFAULT_MILESTONES);
  const [totalReferralXp, setTotalReferralXp] = useState(0);
  const [referralPointsBalance, setReferralPointsBalance] = useState(0);
  const [signupXpBonus, setSignupXpBonus] = useState(0);
  const [signupPointsBonus, setSignupPointsBonus] = useState(0);
  const [retentionXpBonus, setRetentionXpBonus] = useState(0);

  const generateCode = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc('create_referral_code');
    if (error) {
      console.warn('[useReferral] create_referral_code failed', error);
      return;
    }
    if (data) setReferralCode(data as unknown as string);
  }, [user]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);

    // Count referred users; only server-qualified (paid) ones earn rewards.
    const { data: allRefs, error: refsError } = await untypedSupabase
      .from('referrals_safe')
      .select('id, purchase_completed, reward_days')
      .eq('referrer_id', user.id)
      .not('referred_id', 'is', null);

    if (refsError) {
      console.warn('[useReferral] fetchStats failed', refsError);
      setStatsError("We couldn't load your referral stats. Please check your connection and try again.");
      setStatsLoading(false);
      return;
    }

    if (allRefs) {
      const rows = allRefs as any[];
      setReferralCount(rows.length);
      const paid = rows.filter((r) => !!r.purchase_completed);
      setPaidReferralCount(paid.length);
    }

    const { data: rewards } = await untypedSupabase
      .from('referral_rewards')
      .select('reward_days')
      .eq('referrer_id', user.id);
    if (rewards) {
      setTotalDaysEarned(
        (rewards as any[]).reduce((sum, r) => sum + (r.reward_days || 0), 0),
      );
    }

    const [xpResult, pointsResult, milestonesResult, programResult] = await Promise.all([
      untypedSupabase.from('xp_transactions').select('delta').eq('user_id', user.id).eq('reason', 'referral'),
      untypedSupabase.from('referral_points_ledger').select('points_delta').eq('user_id', user.id),
      untypedSupabase.from('referral_reward_milestones')
        .select('milestone_count,premium_days,lifetime,xp_bonus,points_bonus,enabled')
        .eq('enabled', true)
        .order('milestone_count', { ascending: true }),
      untypedSupabase.rpc('get_referral_program_bonuses').maybeSingle(),
    ]);
    if (!xpResult.error && xpResult.data) {
      setTotalReferralXp((xpResult.data as any[]).reduce((sum, row) => sum + Number(row.delta || 0), 0));
    }
    if (!pointsResult.error && pointsResult.data) {
      setReferralPointsBalance((pointsResult.data as any[]).reduce((sum, row) => sum + Number(row.points_delta || 0), 0));
    }
    if (!programResult.error && programResult.data) {
      const program = programResult.data as {
        signup_xp_bonus?: number | null;
        signup_points_bonus?: number | null;
        retention_xp_bonus?: number | null;
      };
      setSignupXpBonus(Number(program.signup_xp_bonus || 0));
      setSignupPointsBonus(Number(program.signup_points_bonus || 0));
      setRetentionXpBonus(Number(program.retention_xp_bonus || 0));
    }
    if (!milestonesResult.error && milestonesResult.data?.length) {
      setMilestones((milestonesResult.data as any[]).map(milestoneFromRow));
    }

    setStatsError(null);
    setStatsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    generateCode();
    fetchStats();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(`referrals:${user.id}:${Math.random().toString(36).slice(2)}`);
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
            fetchStats();
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[useReferral] realtime status:', status);
          }
        });
    } catch (err) {
      console.warn('[useReferral] realtime setup failed:', err);
    }

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
      }
    };
  }, [user, generateCode, fetchStats]);

  return {
    referralCode,
    referralCount,
    paidReferralCount,
    totalDaysEarned,
    statsError,
    statsLoading,
    refetchStats: fetchStats,
    REWARD_DAYS_PER_REFERRAL,
    MILESTONES: milestones,
    totalReferralXp,
    referralPointsBalance,
    signupXpBonus,
    signupPointsBonus,
    retentionXpBonus,
  };
}
