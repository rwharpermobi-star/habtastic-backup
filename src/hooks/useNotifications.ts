import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// One realtime channel per user regardless of how many components mount the
// hook — ref-counted so the socket is torn down only when the last unmounts.
const channels = new Map<string, { channel: ReturnType<typeof supabase.channel>; refs: number }>();

function subscribe(userId: string, onChange: () => void) {
  const existing = channels.get(userId);
  if (existing) {
    existing.refs += 1;
  } else {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => onChange(),
      )
      .subscribe();
    channels.set(userId, { channel, refs: 1 });
  }
  return () => {
    const entry = channels.get(userId);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      supabase.removeChannel(entry.channel);
      channels.delete(userId);
    }
  };
}

export function useNotifications(limit = 30) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const queryKey = useMemo(() => ['notifications', userId, limit] as const, [userId, limit]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, title, body, payload, read_at, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data as unknown) as AppNotification[]) ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (!userId) return;
    return subscribe(userId, () => { void queryClient.invalidateQueries({ queryKey }); });
  }, [userId, queryClient, queryKey]);

  const items: AppNotification[] = data ?? [];
  const unread = useMemo(() => items.filter(i => !i.read_at).length, [items]);

  const markAllRead = useCallback(async () => {
    await supabase.rpc('mark_all_notifications_read');
    queryClient.setQueryData(queryKey, (prev: AppNotification[] | undefined) =>
      (prev ?? []).map(i => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })),
    );
  }, [queryClient, queryKey]);

  return { items, unread, loading: userId ? isLoading : false, markAllRead, refresh: refetch };
}
