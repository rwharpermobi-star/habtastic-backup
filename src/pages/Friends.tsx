import { formatLocalDate } from '@/lib/habitStore';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, UserPlus, Check, X as XIcon, Crown, Trophy, Flame, Zap, Trash2, Users, Copy, Share2, Swords, Target } from 'lucide-react';
import { useFriends } from '@/hooks/useFriends';
import { useFriendChallenges } from '@/hooks/useFriendChallenges';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useHabits } from '@/hooks/useHabits';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SharedAvatar from '@/components/Avatar';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface FriendWeekStats {
  user_id: string;
  name: string;
  avatar_url: string | null;
  xp: number;
  habits_completed: number;
  best_streak: number;
}

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0; let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = formatLocalDate(d);
    if (completions.includes(ds)) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

type SortKey = 'xp' | 'completions' | 'streak';

export default function Friends() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { habits } = useHabits();
  const { friends, incoming, outgoing, loading, sending, sendRequestByCode, respond, cancelOutgoing, unfriend } = useFriends();
  const [code, setCode] = useState('');
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friendCodeLoading, setFriendCodeLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('xp');
  const [stats, setStats] = useState<Record<string, { habits_completed: number; best_streak: number }>>({});
  const [challengeFriendId, setChallengeFriendId] = useState('');
  const [challengeTitle, setChallengeTitle] = useState('Daily habit consistency');
  const [challengeDays, setChallengeDays] = useState(7);
  const [challengeSaving, setChallengeSaving] = useState(false);
  const { challenges, loading: challengesLoading, createForFriend: createHabitChallenge, respondToTarget: respondHabitChallenge } = useFriendChallenges();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await untypedSupabase.rpc('get_my_friend_code');
      if (!active) return;
      if (error) {
        console.error('[Friends] friend code load failed', error);
        toast.error('Could not load your Friend Code.');
      } else {
        setFriendCode(typeof data === 'string' ? data : null);
      }
      setFriendCodeLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const copyFriendCode = async () => {
    if (!friendCode) return;
    try {
      await navigator.clipboard.writeText(friendCode);
      toast.success('Friend Code copied');
    } catch {
      toast.error('Could not copy Friend Code. Please select and copy it manually.');
    }
  };

  const shareFriendCode = async () => {
    if (!friendCode) return;
    const text = `Add me on HabTastic! Use my Friend Code: ${friendCode}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'My HabTastic Friend Code', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Share message copied');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error('Could not share Friend Code.');
    }
  };

  // Self stats from local habits (this week)
  const myStats = useMemo(() => {
    const weekStart = new Date(getWeekStart() + 'T00:00:00');
    const completed = habits.reduce((sum, h) =>
      sum + h.completions.filter(d => new Date(d + 'T00:00:00') >= weekStart).length, 0);
    const bestStreak = habits.reduce((m, h) => Math.max(m, getStreak(h.completions)), 0);
    return { habits_completed: completed, best_streak: bestStreak };
  }, [habits]);

  // Pull friends' weekly_scores for this week
  useEffect(() => {
    (async () => {
      if (!friends.length) { setStats({}); return; }
      const ids = friends.map(f => f.user_id);
      const { data } = await untypedSupabase
        .from('weekly_scores')
        .select('user_id, habits_completed, best_streak')
        .eq('week_start', getWeekStart())
        .in('user_id', ids);
      const map: Record<string, { habits_completed: number; best_streak: number }> = {};
      (data as any[])?.forEach((r) => { map[r.user_id] = { habits_completed: r.habits_completed, best_streak: r.best_streak }; });
      setStats(map);
    })();
  }, [friends]);

  const board: FriendWeekStats[] = useMemo(() => {
    const list: FriendWeekStats[] = friends.map(f => ({
      user_id: f.user_id,
      name: f.name,
      avatar_url: f.avatar_url,
      xp: f.xp,
      habits_completed: stats[f.user_id]?.habits_completed ?? 0,
      best_streak: stats[f.user_id]?.best_streak ?? 0,
    }));
    if (user && profile) {
      list.push({
        user_id: user.id,
        name: profile.name + ' (you)',
        avatar_url: profile.avatar_url,
        xp: profile.xp,
        habits_completed: myStats.habits_completed,
        best_streak: myStats.best_streak,
      });
    }
    list.sort((a, b) => {
      if (sortBy === 'xp') return b.xp - a.xp;
      if (sortBy === 'completions') return b.habits_completed - a.habits_completed;
      return b.best_streak - a.best_streak;
    });
    return list;
  }, [friends, stats, user, profile, myStats, sortBy]);

  const myRank = board.findIndex(b => b.user_id === user?.id) + 1;

  const handleSend = async () => {
    const ok = await sendRequestByCode(code);
    if (ok) setCode('');
  };

  const handleCreateHabitChallenge = async () => {
    if (!challengeFriendId) {
      toast.error('Choose a friend first.');
      return;
    }
    setChallengeSaving(true);
    try {
      const ok = await createHabitChallenge(challengeFriendId, challengeTitle, challengeDays);
      if (ok) setChallengeTitle('Daily habit consistency');
      else toast.error('Could not send the challenge. Confirm you are friends and try again.');
    } finally {
      setChallengeSaving(false);
    }
  };
  const handleRespondToChallenge = async (challengeId: string, accept: boolean) => {
    const ok = await respondHabitChallenge(challengeId, accept);
    if (ok) toast.success(accept ? 'Challenge accepted!' : 'Challenge declined.');
    else toast.error('Could not update this challenge. Refresh and try again.');
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-h1 text-foreground mb-1 flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" /> Friends
      </h1>
      <p className="text-sm text-muted-foreground mb-5">Compete weekly. Push each other.</p>

      {/* Dedicated friend identity: never use a referral code here. */}
      <div className="glass rounded-card p-4 mb-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">My Friend Code</p>
            <p className="font-mono tracking-wider text-primary text-sm">
              {friendCodeLoading ? 'Loading…' : friendCode || 'Unavailable'}
            </p>
          </div>
          <Button size="icon" variant="secondary" onClick={copyFriendCode} disabled={!friendCode} aria-label="Copy Friend Code">
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={shareFriendCode} disabled={!friendCode} aria-label="Share Friend Code">
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Share this code with existing HabTastic users. It only creates a friend request and never grants referral rewards.
        </p>
      </div>

      {/* Add friend by code */}
      <div className="glass rounded-card p-4 mb-5 shadow-card">
        <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" /> Add friend by code
        </p>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="HAB-FRD-XXXXXX"
            maxLength={14}
            className="bg-secondary border-border rounded-input uppercase font-mono tracking-wider"
          />
          <Button onClick={handleSend} disabled={sending || !code.trim()} className="gradient-primary text-primary-foreground rounded-btn">
            Send
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Enter the other registered user's Friend Code. They must accept before you become friends.
        </p>
      </div>

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-bold text-foreground mb-2 uppercase tracking-wide">
            Incoming · {incoming.length}
          </h2>
          <div className="space-y-2">
            {incoming.map(req => (
              <div key={req.id} className="glass rounded-card p-3 flex items-center gap-3">
                <Avatar url={req.avatar_url} name={req.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{req.name}</p>
                  <p className="text-[11px] text-muted-foreground">wants to be friends</p>
                </div>
                <button
                  onClick={() => respond(req.id, true)}
                  className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                  aria-label="Accept"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => respond(req.id, false)}
                  className="w-9 h-9 rounded-full bg-secondary text-muted-foreground flex items-center justify-center"
                  aria-label="Decline"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing pending */}
      {outgoing.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-bold text-foreground mb-2 uppercase tracking-wide">
            Pending · {outgoing.length}
          </h2>
          <div className="space-y-2">
            {outgoing.map(req => (
              <div key={req.id} className="glass rounded-card p-3 flex items-center gap-3 opacity-80">
                <Avatar url={req.avatar_url} name={req.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{req.name}</p>
                  <p className="text-[11px] text-muted-foreground">Waiting for response…</p>
                </div>
                <button
                  onClick={() => cancelOutgoing(req.id)}
                  className="text-xs px-2.5 py-1 rounded-full bg-secondary text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Secure challenges are only available between accepted friends. */}
      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
          <Swords className="w-4 h-4 text-primary" /> Friend Challenges
        </h2>
        <div className="glass rounded-card p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Challenge a friend</p>
          {friends.length === 0 ? (
            <p className="text-xs text-muted-foreground">Accept or add a friend before creating a challenge.</p>
          ) : (
            <>
              <label className="block text-xs text-muted-foreground">
                Friend
                <select
                  value={challengeFriendId}
                  onChange={e => setChallengeFriendId(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border bg-secondary p-3 text-sm text-foreground"
                >
                  <option value="">Choose a friend…</option>
                  {friends.map(friend => <option key={friend.user_id} value={friend.user_id}>{friend.name}</option>)}
                </select>
              </label>
              <label className="block text-xs text-muted-foreground">
                Challenge name
                <input
                  value={challengeTitle}
                  onChange={e => setChallengeTitle(e.target.value.slice(0, 80))}
                  maxLength={80}
                  placeholder="Daily habit consistency"
                  className="mt-1 w-full rounded-input border border-border bg-secondary p-3 text-sm text-foreground"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Duration
                <select
                  value={challengeDays}
                  onChange={e => setChallengeDays(Number(e.target.value))}
                  className="mt-1 w-full rounded-input border border-border bg-secondary p-3 text-sm text-foreground"
                >
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
              <p className="text-[11px] text-muted-foreground">
                Progress counts the days each person completes at least one habit. Your private habit names and mood entries are not shared.
              </p>
              <Button onClick={handleCreateHabitChallenge} disabled={challengeSaving || !challengeFriendId || !challengeTitle.trim()} className="w-full gradient-primary text-primary-foreground">
                {challengeSaving ? 'Sending…' : 'Send challenge'}
              </Button>
            </>
          )}
        </div>

        {challengesLoading ? (
          <p className="text-xs text-muted-foreground">Loading challenges…</p>
        ) : (
          <>
            {challenges.filter(ch => ch.status === 'pending' && ch.opponent_id === user?.id).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase">Challenge requests</h3>
                {challenges.filter(ch => ch.status === 'pending' && ch.opponent_id === user?.id).map(ch => {
                  const sender = friends.find(f => f.user_id === ch.creator_id)?.name || 'Your friend';
                  return <div key={ch.id} className="glass rounded-card p-3">
                    <p className="text-sm font-semibold text-foreground">{ch.habit_name || 'Habit challenge'}</p>
                    <p className="text-xs text-muted-foreground">{sender} · {ch.duration_days} days</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => void handleRespondToChallenge(ch.id, true)} className="flex-1">Accept</Button>
                      <Button size="sm" variant="secondary" onClick={() => void handleRespondToChallenge(ch.id, false)} className="flex-1">Decline</Button>
                    </div>
                  </div>;
                })}
              </div>
            )}

            {challenges.filter(ch => ch.status === 'active').length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase">Active challenges</h3>
                {challenges.filter(ch => ch.status === 'active').map(ch => {
                  const mine = ch.creator_id === user?.id ? ch.creator_progress : ch.opponent_progress;
                  const theirs = ch.creator_id === user?.id ? ch.opponent_progress : ch.creator_progress;
                  const otherId = ch.creator_id === user?.id ? ch.opponent_id : ch.creator_id;
                  const otherName = friends.find(f => f.user_id === otherId)?.name || 'Friend';
                  return <div key={ch.id} className="glass rounded-card p-3">
                    <div className="flex items-start gap-2">
                      <Target className="w-4 h-4 text-primary mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{ch.habit_name || 'Habit challenge'}</p>
                        <p className="text-xs text-muted-foreground">{ch.duration_days}-day challenge with {otherName}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="rounded-lg bg-secondary/60 p-2">
                        <p className="text-[10px] text-muted-foreground">You</p>
                        <p className="text-sm font-bold text-primary">{mine}/{ch.duration_days} days</p>
                      </div>
                      <div className="rounded-lg bg-secondary/60 p-2">
                        <p className="text-[10px] text-muted-foreground">{otherName}</p>
                        <p className="text-sm font-bold text-primary">{theirs}/{ch.duration_days} days</p>
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            )}

            {challenges.filter(ch => ['completed', 'declined', 'expired', 'cancelled'].includes(ch.status)).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground uppercase">Past challenges</h3>
                {challenges.filter(ch => ['completed', 'declined', 'expired', 'cancelled'].includes(ch.status)).map(ch => (
                  <div key={ch.id} className="glass rounded-card p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{ch.habit_name || 'Habit challenge'}</p>
                      <p className="text-xs text-muted-foreground">{ch.duration_days} days · {ch.creator_progress + ch.opponent_progress} total progress days</p>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground">{ch.status}</span>
                  </div>
                ))}
              </div>
            )}
            {challenges.length === 0 && <p className="text-xs text-muted-foreground">No challenges yet. Challenge a friend to get started.</p>}
          </>
        )}
      </section>

      {/* Weekly leaderboard breakdown */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wide flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning" /> This week
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {board.length > 1 && myRank > 0 ? `You're #${myRank}` : 'Invite friends to compete'}
        </p>
      </div>

      <div className="flex gap-1.5 mb-3 bg-secondary/50 p-1 rounded-full">
        <SortPill active={sortBy === 'xp'} onClick={() => setSortBy('xp')} icon={<Zap className="w-3 h-3" />} label="XP" />
        <SortPill active={sortBy === 'completions'} onClick={() => setSortBy('completions')} icon={<Check className="w-3 h-3" />} label="Done" />
        <SortPill active={sortBy === 'streak'} onClick={() => setSortBy('streak')} icon={<Flame className="w-3 h-3" />} label="Streak" />
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8 text-sm">Loading…</p>
      ) : board.length === 0 ? (
        <div className="glass rounded-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No friends yet.</p>
          <p className="text-[11px] text-muted-foreground mt-1">Send a code above to start competing.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {board.map((b, i) => {
            const isSelf = b.user_id === user?.id;
            const value =
              sortBy === 'xp' ? `${b.xp.toLocaleString()} XP` :
              sortBy === 'completions' ? `${b.habits_completed}` :
              `${b.best_streak}🔥`;
            return (
              <div
                key={b.user_id}
                className={`glass rounded-card p-3 flex items-center gap-3 ${isSelf ? 'border-2 border-primary' : ''}`}
              >
                <div className="w-7 text-center font-bold text-foreground">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </div>
                <Avatar url={b.avatar_url} name={b.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{b.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{b.xp}</span>
                    <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />{b.habits_completed}</span>
                    <span className="flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" />{b.best_streak}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold text-primary">{value}</p>
                </div>
                {!isSelf && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${b.name} as friend?`)) unfriend(b.user_id);
                    }}
                    className="p-1.5 rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="Unfriend"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return <SharedAvatar url={url} name={name} size={36} alt={name} />;
}

function SortPill({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full text-xs font-semibold transition ${
        active ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground'
      }`}
    >
      {icon} {label}
    </button>
  );
}
