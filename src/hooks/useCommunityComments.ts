import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { hasAcceptedCommunityTerms } from '@/lib/communityTerms';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface FeedComment {
  id: string;
  feed_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  deleted_at: string | null;
  created_at: string;
  author?: { name: string; avatar_url: string | null };
  replies?: FeedComment[];
}

export function useFeedComments(feedId: string | null) {
  const { user } = useAuth();
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!feedId) return;
    setLoading(true);
    const { data } = await untypedSupabase
      .from('community_feed_comments')
      .select('id, feed_id, user_id, parent_id, content, deleted_at, created_at')
      .eq('feed_id', feedId)
      .is('hidden_at', null)
      .order('created_at', { ascending: true });

    const rows = (data as FeedComment[]) || [];
    const uids = Array.from(new Set(rows.map(r => r.user_id)));
    if (uids.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('user_id, name, avatar_url').in('user_id', uids);
      const pmap: Record<string, any> = {};
      profiles?.forEach((p) => { pmap[p.user_id] = { name: p.name, avatar_url: p.avatar_url }; });
      rows.forEach(r => { r.author = pmap[r.user_id]; });
    }
    // Build tree (1 level)
    const top = rows.filter(r => !r.parent_id);
    top.forEach(t => { t.replies = rows.filter(r => r.parent_id === t.id); });
    setComments(top);
    setLoading(false);
  }, [feedId]);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async (content: string, parentId: string | null = null) => {
    if (!feedId) return;
    // Community rules must be accepted before any UGC interaction.
    if (!hasAcceptedCommunityTerms(user)) {
      toast.error('Please accept the community rules first');
      return false;
    }
    const { error } = await untypedSupabase.rpc('add_feed_comment', {
      _feed_id: feedId, _parent_id: parentId, _content: content,
    });
    if (error) { toast.error(error.message); return false; }
    await load();
    return true;
  }, [feedId, load, user]);

  const remove = useCallback(async (id: string) => {
    const { error } = await untypedSupabase.rpc('delete_feed_comment', { _id: id });
    if (error) { toast.error(error.message); return; }
    await load();
  }, [load]);

  return { comments, loading, add, remove, refresh: load };
}

export function useCommentCounts(feedIds: string[]) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!feedIds.length) { setCounts({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await untypedSupabase
        .from('community_feed_comments')
        .select('feed_id')
        .in('feed_id', feedIds)
        .is('deleted_at', null);
      if (cancelled) return;
      const c: Record<string, number> = {};
      (data as any[])?.forEach(r => { c[r.feed_id] = (c[r.feed_id] || 0) + 1; });
      setCounts(c);
    })();
    return () => { cancelled = true; };
  }, [feedIds.join(',')]);

  return counts;
}
