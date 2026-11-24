import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Users, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCommunityChallenges, type CommunityChallenge } from '@/hooks/useCommunityChallenges';
import { cn } from '@/lib/utils';

function KindPill({ kind }: { kind: string }) {
  const colors: Record<string, string> = {
    daily: 'bg-warning/20 text-warning',
    weekly: 'bg-primary/20 text-primary',
    monthly: 'bg-purple-500/20 text-purple-400',
    event: 'bg-pink-500/20 text-pink-400',
  };
  return (
    <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider', colors[kind] || 'bg-secondary')}>
      {kind}
    </span>
  );
}

function ChallengeCard({ c, onJoin, onClaim }: {
  c: CommunityChallenge;
  onJoin: (id: string) => void;
  onClaim: (id: string) => void;
}) {
  const joined = !!c.participation;
  const progress = c.participation?.progress || 0;
  const pct = Math.min(100, Math.round((progress / c.target_value) * 100));
  const completed = !!c.participation?.completed_at;
  const claimed = !!c.participation?.claimed_at;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-card p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl">{c.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <KindPill kind={c.kind} />
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="w-2.5 h-2.5" /> {c.participant_count}
            </span>
          </div>
          <p className="text-sm font-bold text-foreground">{c.title}</p>
          <p className="text-[11px] text-muted-foreground">{c.description}</p>
        </div>
      </div>

      {joined && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>Progress</span>
            <span className="font-semibold text-foreground">{progress} / {c.target_value}</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full gradient-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-2 text-[11px] font-semibold">
          <span className="flex items-center gap-1 text-primary"><Sparkles className="w-3 h-3" />{c.reward_xp} XP</span>
        </div>
        {claimed ? (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Check className="w-3 h-3" /> Claimed</span>
        ) : completed ? (
          <Button size="sm" onClick={() => onClaim(c.id)} className="gradient-primary text-primary-foreground rounded-btn h-8 px-3 text-xs">
            Claim
          </Button>
        ) : joined ? (
          <span className="text-[11px] text-muted-foreground">In progress…</span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onJoin(c.id)} className="rounded-btn h-8 px-3 text-xs">
            Join
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export default function CommunityChallenges() {
  const { challenges, loading, join, claim } = useCommunityChallenges();
  const [filter, setFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all');

  const filtered = filter === 'all' ? challenges : challenges.filter(c => c.kind === filter);

  return (
    <div>
      <div className="flex gap-1.5 mb-3 bg-secondary/50 p-1 rounded-full">
        {(['all', 'daily', 'weekly', 'monthly'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex-1 py-1.5 rounded-full text-xs font-semibold transition capitalize',
              filter === f ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No active challenges</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => <ChallengeCard key={c.id} c={c} onJoin={join} onClaim={claim} />)}
        </div>
      )}
    </div>
  );
}
