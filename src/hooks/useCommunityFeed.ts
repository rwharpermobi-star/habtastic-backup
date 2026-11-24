import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { hasAcceptedCommunityTerms } from '@/lib/communityTerms';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface FeedItem {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  author?: { name: string; avatar_url: string | null };
  reactions: Record<string, number>;
  my_reactions: string[];
}

export const FEED_EMOJIS = ['👍', '🔥', '🎉', '💪'] as const;

export function useCommunityFeed(pageSize = 20) {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (before?: string): Promise<FeedItem[]> => {
    let q = untypedSupabase
      .from('community_feed')
      .select('id, user_id, event_type, payload, created_at')
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(pageSize);
    if (before) q = q.lt('created_at', before);
    const { data: feed } = await q;
    if (!feed || feed.length === 0) return [];

    const userIds = Array.from(new Set((feed as any[]).map(f => f.user_id as string)));
    const feedIds = (feed as any[]).map(f => f.id as string);

    const [{ data: profiles }, { data: reacts }] = await Promise.all([
      supabase.from('profiles').select('user_id, name, avatar_url').in('user_id', userIds),
      supabase.from('community_feed_reactions').select('feed_id, user_id, emoji').in('feed_id', feedIds),
    ]);

    const pmap: Record<string, { name: string; avatar_url: string | null }> = {};
    profiles?.forEach((p) => { pmap[p.user_id] = { name: p.name, avatar_url: p.avatar_url }; });

    const rByFeed: Record<string, { counts: Record<string, number>; mine: string[] }> = {};
    reacts?.forEach((r) => {
      const entry = rByFeed[r.feed_id] ||= { counts: {}, mine: [] };
      entry.counts[r.emoji] = (entry.counts[r.emoji] || 0) + 1;
      if (user && r.user_id === user.id) entry.mine.push(r.emoji);
    });

    return feed.map((f) => ({
      ...f,
      author: pmap[f.user_id],
      reactions: rByFeed[f.id]?.counts || {},
      my_reactions: rByFeed[f.id]?.mine || [],
    }));
  }, [pageSize, user]);

  const load = useCallback(async () => {
    setLoading(true);
    const page = await fetchPage();
    setItems(page);
    setHasMore(page.length === pageSize);
    setLoading(false);
  }, [fetchPage, pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || items.length === 0) return;
    setLoadingMore(true);
    const last = items[items.length - 1].created_at;
    const page = await fetchPage(last);
    setItems(prev => [...prev, ...page]);
    setHasMore(page.length === pageSize);
    setLoadingMore(false);
  }, [fetchPage, items, loadingMore, hasMore, pageSize]);

  useEffect(() => { load(); }, [load]);

  const toggleReaction = useCallback(async (feedId: string, emoji: string) => {
    if (!user) return;
    // Community rules must be accepted before any UGC interaction.
    if (!hasAcceptedCommunityTerms(user)) {
      toast.error('Please accept the community rules first');
      return;
    }
    // optimistic
    setItems(prev => prev.map(it => {
      if (it.id !== feedId) return it;
      const had = it.my_reactions.includes(emoji);
      const counts = { ...it.reactions };
      counts[emoji] = Math.max(0, (counts[emoji] || 0) + (had ? -1 : 1));
      const mine = had ? it.my_reactions.filter(e => e !== emoji) : [...it.my_reactions, emoji];
      return { ...it, reactions: counts, my_reactions: mine };
    }));
    const { error } = await supabase.rpc('toggle_feed_reaction', { _feed_id: feedId, _emoji: emoji });
    if (error) { toast.error('Could not react'); load(); }
  }, [user, load]);

  return { items, loading, loadingMore, hasMore, loadMore, refresh: load, toggleReaction };
}
