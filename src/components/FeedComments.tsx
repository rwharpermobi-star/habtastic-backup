import { useState } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Send, Trash2, MoreVertical, Flag } from 'lucide-react';
import { useFeedComments, type FeedComment } from '@/hooks/useCommunityComments';
import { useAuth } from '@/contexts/AuthContext';
import { useUserModeration } from '@/hooks/useUserModeration';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

function CommentRow({
  c, onReply, onDelete, onReport, currentUserId,
}: {
  c: FeedComment;
  onReply: (id: string) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  currentUserId?: string;
}) {
  const mine = c.user_id === currentUserId;
  return (
    <div className="flex gap-2.5 py-2">
      {visibleAvatarUrl(c.author?.avatar_url) ? (
        <img loading="lazy" decoding="async" src={visibleAvatarUrl(c.author.avatar_url) ?? undefined} alt="" className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs">
          {(c.author?.name || '?')[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{c.author?.name || 'User'}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm text-foreground break-words">{c.content}</p>
        <div className="flex gap-3 mt-1">
          <button onClick={() => onReply(c.id)} className="text-[10px] text-primary hover:underline">Reply</button>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="text-muted-foreground p-1"><MoreVertical className="w-3.5 h-3.5" /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {mine && (
            <DropdownMenuItem onClick={() => onDelete(c.id)} className="text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          )}
          {!mine && (
            <DropdownMenuItem onClick={() => onReport(c.id)}>
              <Flag className="w-3.5 h-3.5 mr-2" /> Report
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function FeedCommentsSheet({
  feedId, open, onOpenChange,
}: { feedId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const { comments, loading, add, remove } = useFeedComments(open ? feedId : null);
  const { report } = useUserModeration();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const v = text.trim(); if (!v) return;
    setSending(true);
    const ok = await add(v, replyTo);
    setSending(false);
    if (ok) { setText(''); setReplyTo(null); }
  };

  const handleReport = async (commentId: string) => {
    const reason = window.prompt('Why are you reporting this comment?');
    if (reason && reason.trim()) await report('comment', commentId, reason.trim());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] flex flex-col p-4">
        <SheetHeader>
          <SheetTitle>Comments</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-2">
          {loading && <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>}
          {!loading && comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Be the first to comment 💬</p>
          )}
          {comments.map(c => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <CommentRow c={c} currentUserId={user?.id} onReply={setReplyTo} onDelete={remove} onReport={handleReport} />
              {c.replies && c.replies.length > 0 && (
                <div className="pl-10 border-l border-border ml-4">
                  {c.replies.map(r => (
                    <CommentRow key={r.id} c={r} currentUserId={user?.id}
                      onReply={() => setReplyTo(c.id)} onDelete={remove} onReport={handleReport} />
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {replyTo && (
          <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-between">
            <span>Replying…</span>
            <button onClick={() => setReplyTo(null)} className="text-primary">Cancel</button>
          </div>
        )}
        <div className="flex gap-2 pt-2 border-t border-border">
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Write a comment…" maxLength={500}
            className="flex-1 bg-secondary/50 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button onClick={submit} disabled={sending || !text.trim()}
            className="gradient-primary text-primary-foreground rounded-full p-2 disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
