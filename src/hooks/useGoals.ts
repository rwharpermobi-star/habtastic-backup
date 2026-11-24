import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  target_value: number;
  current_value: number;
  unit: string;
  frequency: string;
  status: string;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export function useGoals() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const queryKey = useMemo(() => ['goals', userId] as const, [userId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Goal[]) ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const goals: Goal[] = data ?? [];
  const read = useCallback(() => queryClient.getQueryData<Goal[]>(queryKey) ?? [], [queryClient, queryKey]);
  const write = useCallback((next: Goal[]) => queryClient.setQueryData(queryKey, next), [queryClient, queryKey]);

  const addGoal = useCallback(async (goal: { title: string; description?: string; target_value?: number; unit?: string; frequency?: string; deadline?: string }) => {
    if (!userId) return;
    const { data } = await supabase.from('goals').insert({ ...goal, user_id: userId }).select().single();
    if (data) write([data as Goal, ...read()]);
    return (data as Goal) ?? null;
  }, [userId, read, write]);

  const updateGoal = useCallback(async (id: string, updates: Partial<Pick<Goal, 'title' | 'description' | 'target_value' | 'current_value' | 'unit' | 'frequency' | 'status' | 'deadline'>>) => {
    if (!userId) return;
    await supabase.from('goals').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    write(read().map(g => g.id === id ? { ...g, ...updates } : g));
  }, [userId, read, write]);

  const deleteGoal = useCallback(async (id: string) => {
    await supabase.from('goals').delete().eq('id', id);
    write(read().filter(g => g.id !== id));
  }, [read, write]);

  const { activeGoals, completedGoals } = useMemo(() => ({
    activeGoals: goals.filter(g => g.status === 'active'),
    completedGoals: goals.filter(g => g.status === 'completed'),
  }), [goals]);

  return { goals, activeGoals, completedGoals, loading: userId ? isLoading : false, addGoal, updateGoal, deleteGoal, refetch };
}
