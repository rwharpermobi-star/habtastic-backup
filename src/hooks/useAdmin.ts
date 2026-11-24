import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { untypedSupabase } from "@/integrations/supabase/untyped";

/**
 * Admin role check, cached per user via React Query so the many screens that
 * gate on it share one lookup instead of querying `user_roles` on each mount.
 */
export function useAdmin() {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['is-admin', userId],
    queryFn: async () => {
      const { data } = await untypedSupabase
        .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
      return !!data;
    },
    enabled: !!userId,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  return { isAdmin: data ?? false, loading: userId ? isLoading : false };
}
