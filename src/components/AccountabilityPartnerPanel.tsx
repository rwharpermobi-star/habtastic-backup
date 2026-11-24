import { useState } from 'react';
import { motion } from 'framer-motion';
import { Handshake, Check, X as XIcon, Send, MessageCircle } from 'lucide-react';
import { useAccountabilityPartner } from '@/hooks/useAccountabilityPartner';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

export default function AccountabilityPartnerPanel() {
  const { user } = useAuth();
  const { partnership, pendingIn, pendingOut, checkins, loading, requestPartner, respond, endPartnership, postCheckin, weekStart } = useAccountabilityPartner();
  const { friends } = useFriends();
  const [message, setMessage] = useState('');

  if (loading) return <p className="text-center text-muted-foreground py-8 text-sm">Loading…</p>;

  // Incoming requests
  if (pendingIn.length > 0) {
    const req = pendingIn[0];
    return (
      <div className="glass rounded-card p-4 shadow-card">
        <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider mb-2">Incoming partner request</p>
        <div className="flex items-center gap-3 mb-3">
          {visibleAvatarUrl(req.other.avatar_url)
            ? <img loading="lazy" decoding="async" src={visibleAvatarUrl(req.other.avatar_url) ?? undefined} alt={req.other.name} className="w-12 h-12 rounded-full object-cover" />
            : <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-lg">🤝</div>}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{req.other.name}</p>
            <p className="text-[11px] text-muted-foreground">wants to be your accountability partner</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => respond(req.id, true)} className="flex-1 gradient-primary text-primary-foreground rounded-btn">
            <Check className="w-4 h-4 mr-1" /> Accept
          </Button>
          <Button onClick={() => respond(req.id, false)} variant="outline" className="rounded-btn">
            <XIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Active partnership
  if (partnership) {
    const checkedInThisWeek = checkins.some(c => c.user_id === user?.id && c.week_start === weekStart);
    return (
      <div className="space-y-3">
        <div className="glass rounded-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            {visibleAvatarUrl(partnership.other.avatar_url)
              ? <img loading="lazy" decoding="async" src={visibleAvatarUrl(partnership.other.avatar_url) ?? undefined} alt={partnership.other.name} className="w-12 h-12 rounded-full object-cover" />
              : <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-lg">🤝</div>}
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase font-bold text-primary tracking-wider">Your partner</p>
              <p className="text-base font-bold text-foreground truncate">{partnership.other.name}</p>
              <p className="text-[11px] text-muted-foreground">{partnership.other.xp.toLocaleString()} XP</p>
            </div>
          </div>
        </div>

        {/* Weekly check-in */}
        <div className="glass rounded-card p-4 shadow-card">
          <p className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" /> This week's check-in
          </p>
          {checkedInThisWeek ? (
            <p className="text-xs text-muted-foreground">✅ You've checked in this week.</p>
          ) : (
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Share your week…"
                maxLength={500}
                className="bg-secondary border-border rounded-input text-sm"
              />
              <Button
                onClick={async () => { if (await postCheckin(message)) setMessage(''); }}
                disabled={!message.trim()}
                className="gradient-primary text-primary-foreground rounded-btn"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Recent check-ins */}
        {checkins.length > 0 && (
          <div>
            <p className="text-xs uppercase font-bold text-muted-foreground tracking-wider mb-2">Recent</p>
            <div className="space-y-2">
              {checkins.slice(0, 8).map(c => {
                const isMe = c.user_id === user?.id;
                return (
                  <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-card p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-foreground">
                        {isMe ? 'You' : partnership.other.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{c.message}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          onClick={() => { if (confirm('End this partnership?')) endPartnership(partnership.id); }}
          className="w-full rounded-btn text-destructive"
        >
          End partnership
        </Button>
      </div>
    );
  }

  // No partnership: show friends list to pick from
  return (
    <div>
      <div className="glass rounded-card p-4 shadow-card mb-3 text-center">
        <Handshake className="w-10 h-10 text-primary mx-auto mb-2" />
        <p className="text-sm font-bold text-foreground">Find an accountability partner</p>
        <p className="text-[11px] text-muted-foreground mt-1">Pick a friend to keep each other on track with weekly check-ins.</p>
      </div>

      {pendingOut.length > 0 && (
        <div className="glass rounded-card p-3 mb-3">
          <p className="text-[11px] text-muted-foreground">
            Pending request to <span className="font-semibold text-foreground">{pendingOut[0].other.name}</span>…
          </p>
        </div>
      )}

      {friends.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-6">Add a friend first to choose a partner.</p>
      ) : (
        <div className="space-y-2">
          {friends.map(f => (
            <div key={f.user_id} className="glass rounded-card p-3 flex items-center gap-3">
              {visibleAvatarUrl(f.avatar_url)
                ? <img loading="lazy" decoding="async" src={visibleAvatarUrl(f.avatar_url) ?? undefined} alt={f.name} className="w-9 h-9 rounded-full object-cover" />
                : <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">{f.name[0]}</div>}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{f.name}</p>
                <p className="text-[10px] text-muted-foreground">{f.xp.toLocaleString()} XP</p>
              </div>
              <Button
                size="sm"
                disabled={pendingOut.length > 0}
                onClick={() => requestPartner(f.user_id)}
                className="gradient-primary text-primary-foreground rounded-btn h-8 px-3 text-xs"
              >
                Ask
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
