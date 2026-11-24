import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Crown {
  user_id: string;
  period_start: string;
  place: 1 | 2 | 3;
}

export function useMyCrowns() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-crowns', user?.id],
    queryFn: async () => {
      if (!user) return [] as Crown[];
      const { data } = await supabase
        .from('leaderboard_crowns')
        .select('user_id, period_start, place')
        .eq('user_id', user.id)
        .order('period_start', { ascending: false });
      return (data || []) as Crown[];
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

export function useCrownsForUsers(userIds: string[]) {
  return useQuery({
    queryKey: ['crowns-for', [...userIds].sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, Crown[]>;
      const { data } = await supabase
        .from('leaderboard_crowns')
        .select('user_id, period_start, place')
        .in('user_id', userIds);
      const map: Record<string, Crown[]> = {};
      (data || []).forEach((c) => {
        (map[c.user_id] ||= []).push(c as Crown);
      });
      return map;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60_000,
  });
}
