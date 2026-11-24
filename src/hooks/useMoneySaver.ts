import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePremium } from '@/hooks/usePremium';

export type SavingFrequency = 'daily' | 'weekly' | 'monthly';
export type SavingsChallengeType = 'daily_amount' | 'weekly_amount' | 'no_spend_weekend' | 'seven_day' | 'thirty_day' | 'custom';

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  starting_amount: number;
  current_amount: number;
  target_date: string;
  currency: string;
  reason: string | null;
  regular_saving_amount: number | null;
  saving_frequency: SavingFrequency;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface SavingsEntry {
  id: string;
  user_id: string;
  goal_id: string;
  amount: number;
  saved_at: string;
  source: 'manual' | 'initial' | 'winston' | 'challenge';
  note: string | null;
  created_at: string;
}

export interface SavingsChallenge {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  challenge_type: SavingsChallengeType;
  target_amount: number | null;
  currency: string;
  start_date: string;
  end_date: string;
  completed_dates: string[];
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface CreateSavingsGoalInput {
  name: string;
  targetAmount: number;
  alreadySaved: number;
  targetDate: string;
  currency: string;
  reason?: string;
  regularSavingAmount?: number | null;
  savingFrequency?: SavingFrequency;
}

const db = supabase;

export function useMoneySaver() {
  const { user } = useAuth();
  const { isPremium } = usePremium();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const key = useMemo(() => ['money-saver', userId] as const, [userId]);

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const [goalsRes, entriesRes, challengesRes] = await Promise.all([
        db.from('savings_goals').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
        db.from('savings_entries').select('*').eq('user_id', userId).order('saved_at', { ascending: true }),
        db.from('savings_challenges').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      ]);
      if (goalsRes.error) throw goalsRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (challengesRes.error) throw challengesRes.error;
      return {
        goals: (goalsRes.data ?? []) as SavingsGoal[],
        entries: (entriesRes.data ?? []) as SavingsEntry[],
        challenges: (challengesRes.data ?? []) as SavingsChallenge[],
      };
    },
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const goals = query.data?.goals ?? [];
  const entries = query.data?.entries ?? [];
  const challenges = query.data?.challenges ?? [];
  const allActiveGoals = useMemo(
    () => goals
      .filter(g => g.status === 'active')
      .slice()
      .sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
        a.id.localeCompare(b.id)
      ),
    [goals],
  );
  const activeGoals = isPremium ? allActiveGoals : allActiveGoals.slice(0, 1);
  const lockedGoals = isPremium ? [] : allActiveGoals.slice(1);
  const lockedGoalIds = useMemo(() => new Set(lockedGoals.map(g => g.id)), [lockedGoals]);
  const isGoalLocked = useCallback((goalId: string) => lockedGoalIds.has(goalId), [lockedGoalIds]);
  const completedGoals = goals.filter(g => g.status === 'completed');
  const accessibleGoalIds = useMemo(
    () => new Set([...activeGoals, ...completedGoals].map(g => g.id)),
    [activeGoals, completedGoals],
  );
  const activeChallenges = challenges.filter(
    c => c.status === 'active' && (c.goal_id == null || accessibleGoalIds.has(c.goal_id)),
  );
  const nonArchivedGoals = goals.filter(g => g.status !== 'archived');
  const canCreateGoal = isPremium || allActiveGoals.length === 0;

  const createGoal = useCallback(async (input: CreateSavingsGoalInput) => {
    if (!userId) throw new Error('Sign in required');
    if (!isPremium && allActiveGoals.length >= 1) {
      throw new Error('Free users can have 1 active Money Saver goal. Your other Premium goals stay saved until you upgrade again.');
    }
    const { data, error } = await db.rpc('create_savings_goal', {
      _name: input.name.trim(),
      _target_amount: input.targetAmount,
      _already_saved: input.alreadySaved,
      _target_date: input.targetDate,
      _currency: input.currency.toUpperCase(),
      _reason: input.reason?.trim() || null,
      _regular_saving_amount: input.regularSavingAmount ?? null,
      _saving_frequency: input.savingFrequency ?? 'weekly',
    });
    if (error) {
      if (error.message?.includes('free_money_saver_limit_reached')) {
        throw new Error('Free users can have 1 active Money Saver goal. Upgrade to Premium for unlimited savings goals.');
      }
      throw error;
    }
    await refresh();
    return data as SavingsGoal;
  }, [userId, isPremium, allActiveGoals.length, refresh]);

  const addSavings = useCallback(async (goalId: string, amount: number, note?: string, source: SavingsEntry['source'] = 'manual') => {
    if (!userId) throw new Error('Sign in required');
    if (isGoalLocked(goalId)) {
      throw new Error('This Premium savings goal is saved but locked. Upgrade to continue it without starting over.');
    }
    const { data, error } = await db.rpc('record_savings_entry', {
      _goal_id: goalId,
      _amount: amount,
      _source: source,
      _note: note?.trim() || null,
    });
    if (error) throw error;
    await refresh();
    return data as SavingsGoal;
  }, [userId, refresh, isGoalLocked]);

  const updateGoal = useCallback(async (goalId: string, updates: Partial<Pick<SavingsGoal, 'name' | 'target_amount' | 'target_date' | 'currency' | 'reason' | 'regular_saving_amount' | 'saving_frequency' | 'status'>>) => {
    if (!userId) throw new Error('Sign in required');
    if (isGoalLocked(goalId)) {
      throw new Error('This Premium savings goal is saved but locked. Upgrade to continue it without starting over.');
    }
    const { error } = await db.from('savings_goals').update(updates).eq('id', goalId).eq('user_id', userId);
    if (error) throw error;
    await refresh();
  }, [userId, refresh, isGoalLocked]);

  const deleteGoal = useCallback(async (goalId: string) => {
    if (!userId) throw new Error('Sign in required');
    const { error } = await db.from('savings_goals').delete().eq('id', goalId).eq('user_id', userId);
    if (error) throw error;
    const deleted = (query.data?.goals ?? []).find((g: SavingsGoal) => g.id === goalId);
    if (deleted?.name) {
      await db.from('winston_memory')
        .delete()
        .eq('user_id', userId)
        .eq('tag_type', 'goal')
        .ilike('value', `%${deleted.name.replace(/%/g, '')}%`)
        .then(() => undefined);
    }
    await refresh();
  }, [userId, refresh, query.data?.goals]);

  const createChallenge = useCallback(async (input: {
    goalId?: string | null;
    title: string;
    type: SavingsChallengeType;
    targetAmount?: number | null;
    currency: string;
    startDate: string;
    endDate: string;
  }) => {
    if (!userId) throw new Error('Sign in required');
    if (input.goalId && isGoalLocked(input.goalId)) {
      throw new Error('This Premium savings goal is saved but locked. Upgrade to continue it without starting over.');
    }
    const { data, error } = await db.from('savings_challenges').insert({
      user_id: userId,
      goal_id: input.goalId ?? null,
      title: input.title,
      challenge_type: input.type,
      target_amount: input.targetAmount ?? null,
      currency: input.currency.toUpperCase(),
      start_date: input.startDate,
      end_date: input.endDate,
    }).select().single();
    if (error) throw error;
    await refresh();
    return data as SavingsChallenge;
  }, [userId, refresh, isGoalLocked]);

  const updateChallenge = useCallback(async (challengeId: string, updates: Partial<Pick<SavingsChallenge, 'completed_dates' | 'status'>>) => {
    if (!userId) throw new Error('Sign in required');
    const challenge = challenges.find(c => c.id === challengeId);
    if (challenge?.goal_id && isGoalLocked(challenge.goal_id)) {
      throw new Error('This Premium savings challenge is saved but locked. Upgrade to continue it without starting over.');
    }
    const { error } = await db.from('savings_challenges').update(updates).eq('id', challengeId).eq('user_id', userId);
    if (error) throw error;
    await refresh();
  }, [userId, refresh, challenges, isGoalLocked]);

  return {
    goals,
    allActiveGoals,
    activeGoals,
    lockedGoals,
    isGoalLocked,
    completedGoals,
    entries,
    challenges,
    activeChallenges,
    nonArchivedGoals,
    canCreateGoal,
    loading: userId ? query.isLoading : false,
    error: query.error,
    createGoal,
    addSavings,
    updateGoal,
    deleteGoal,
    createChallenge,
    updateChallenge,
    refresh,
  };
}
