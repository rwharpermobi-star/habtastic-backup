import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, MoreVertical, Flag, VolumeX, Ban } from 'lucide-react';
import { useCommunityFeed, FEED_EMOJIS, type FeedItem } from '@/hooks/useCommunityFeed';
import { useCommentCounts } from '@/hooks/useCommunityComments';
import { useUserModeration } from '@/hooks/useUserModeration';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import FeedCommentsSheet from './FeedComments';
import { supabase } from '@/integrations/supabase/client';
import type { FeedFilter } from './FeedFilters';
import { eventTypesForFilter } from './FeedFilters';
import Avatar from '@/components/Avatar';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';
import { untypedSupabase } from "@/integrations/supabase/untyped";

function describe(item: FeedItem): { title: string; subtitle: string; icon: string } {
  const p = item.payload || {};
  const name = item.author?.name || 'Someone';
  switch (item.event_type) {
    case 'streak_milestone':
      return { title: `${name} hit a ${p.streak}-day streak!`, subtitle: `${p.emoji || '🔥'} ${p.habit_name || 'a habit'}`, icon: '🔥' };
    case 'challenge_completed':
      return { title: `${name} completed a ${p.kind || ''} challenge`, subtitle: `${p.emoji || '🏆'} ${p.title || 'Challenge'}`, icon: '🏆' };
    case 'partner_accepted':
      return { title: `${name} found an accountability partner`, subtitle: '🤝 New partnership', icon: '🤝' };
    case 'rank_up':
      return { title: `${name} ranked up to ${p.rank || 'a new tier'}`, subtitle: `✨ ${p.xp || ''} XP`, icon: '🚀' };
    case 'referral_earned':
      return {
        title: `${name} earned a referral reward`,
        subtitle: p.days ? `🎁 +${p.days} days Premium` : '🎁 Premium reward unlocked',
        icon: '🎁',
      };
    default:
      return { title: `${name} did something cool`, subtitle: item.event_type, icon: '✨' };
  }
}

function FeedRow({ item, onReact, commentCount, onOpenComments, onReport, onMute, onBlock, isOwn }: {
  item: FeedItem;
  onReact: (id: string, e: string) => void;
  commentCount: number;
  onOpenComments: (id: string) => void;
  onReport: (id: string) => void;
  onMute: (uid: string) => void;
  onBlock: (uid: string) => void;
  isOwn: boolean;
}) {
  const { title, subtitle, icon } = describe(item);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-card p-3 shadow-card">
      <div className="flex items-center gap-3">
        {visibleAvatarUrl(item.author?.avatar_url) ? (
          <Avatar url={item.author.avatar_url} name={item.author.name} size={40} alt={item.author.name} />
        ) : (
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-base">{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
        {!isOwn && (
          <DropdownMenu>
            <DropdownMenuTrigger className="text-muted-foreground p-1"><MoreVertical className="w-3.5 h-3.5" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onReport(item.id)}><Flag className="w-3.5 h-3.5 mr-2" /> Report post</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMute(item.user_id)}><VolumeX className="w-3.5 h-3.5 mr-2" /> Mute user</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBlock(item.user_id)} className="text-destructive"><Ban className="w-3.5 h-3.5 mr-2" /> Block user</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex gap-1.5 mt-2.5 items-center">
        {FEED_EMOJIS.map(e => {
          const count = item.reactions[e] || 0;
          const mine = item.my_reactions.includes(e);
          return (
            <button key={e} onClick={() => onReact(item.id, e)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition border',
                mine ? 'bg-primary/15 border-primary text-primary' : 'bg-secondary/50 border-transparent text-muted-foreground hover:bg-secondary'
              )}>
              <span>{e}</span>{count > 0 && <span>{count}</span>}
            </button>
          );
        })}
        <button onClick={() => onOpenComments(item.id)}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary/50 text-muted-foreground hover:bg-secondary">
          <MessageSquare className="w-3.5 h-3.5" />{commentCount > 0 && <span>{commentCount}</span>}
        </button>
      </div>
    </motion.div>
  );
}

function InfiniteScrollSentinel({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onVisible);
  cbRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cbRef.current();
    }, { rootMargin: '300px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex justify-center mt-3 py-4">
      {loading ? (
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading more" />
      ) : (
        <button onClick={() => cbRef.current()} className="text-[11px] text-muted-foreground hover:text-foreground">
          Load more
        </button>
      )}
    </div>
  );
}

export default function CommunityFeed({ filter = 'all' }: { filter?: FeedFilter }) {
  const { user } = useAuth();
  const { items, loading, loadingMore, hasMore, loadMore, toggleReaction } = useCommunityFeed(20);
  const { blocked, muted, toggleBlock, toggleMute, report } = useUserModeration();
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [trendingScores, setTrendingScores] = useState<Record<string, number>>({});

  // Trending score map
  useEffect(() => {
    if (filter !== 'trending') return;
    (async () => {
      const { data } = await untypedSupabase.from('community_trending_feed').select('id, score');
      const m: Record<string, number> = {};
      (data as any[])?.forEach(r => { m[r.id] = r.score; });
      setTrendingScores(m);
    })();
  }, [filter]);

  const filtered = useMemo(() => {
    let list = items.filter(i => !blocked.has(i.user_id) && !muted.has(i.user_id));
    const types = eventTypesForFilter(filter);
    if (types) list = list.filter(i => types.includes(i.event_type));
    if (filter === 'trending') {
      list = list.filter(i => trendingScores[i.id] !== undefined);
      list.sort((a, b) => (trendingScores[b.id] || 0) - (trendingScores[a.id] || 0));
    }
    return list;
  }, [items, blocked, muted, filter, trendingScores]);

  const commentCounts = useCommentCounts(filtered.map(i => i.id));

  const handleReport = async (id: string) => {
    const reason = window.prompt('Why are you reporting this post?');
    if (reason && reason.trim()) await report('post', id, reason.trim());
  };

  if (loading) return <p className="text-center text-muted-foreground py-8 text-sm">Loading feed…</p>;
  if (filtered.length === 0) {
    return (
      <div className="glass rounded-card p-6 text-center">
        <p className="text-sm text-foreground">Nothing here yet 🌱</p>
        <p className="text-[11px] text-muted-foreground mt-1">Try another filter or complete habits to see activity.</p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-2">
        {filtered.map(i => (
          <FeedRow key={i.id} item={i} onReact={toggleReaction}
            commentCount={commentCounts[i.id] || 0}
            onOpenComments={setOpenCommentsFor}
            onReport={handleReport}
            onMute={toggleMute}
            onBlock={toggleBlock}
            isOwn={i.user_id === user?.id}
          />
        ))}
      </div>
      {hasMore && filter !== 'trending' && (
        <InfiniteScrollSentinel onVisible={loadMore} loading={loadingMore} />
      )}
      <FeedCommentsSheet feedId={openCommentsFor} open={!!openCommentsFor} onOpenChange={v => !v && setOpenCommentsFor(null)} />
    </>
  );
}