import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ArrowLeft, Crown, Flame, Target, Sparkles, Star, Medal, User, Swords, Share2, Copy, Check, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useFriendChallenges } from '@/hooks/useFriendChallenges';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import CrownBadge from '@/components/CrownBadge';
import StarRating from '@/components/StarRating';
import { useCrownsForUsers } from '@/hooks/useLeaderboardCrowns';
import Avatar from '@/components/Avatar';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

const GRADE_STYLES: Record<string, { bg: string; text: string }> = {
  S: { bg: 'bg-gradient-to-br from-yellow-400/20 to-amber-500/20', text: 'text-yellow-600 dark:text-yellow-400' },
  A: { bg: 'bg-gradient-to-br from-primary/20 to-accent/20', text: 'text-primary' },
  B: { bg: 'bg-gradient-to-br from-blue-400/20 to-cyan-400/20', text: 'text-blue-600 dark:text-blue-400' },
  C: { bg: 'bg-gradient-to-br from-orange-400/20 to-amber-400/20', text: 'text-orange-600 dark:text-orange-400' },
  D: { bg: 'bg-gradient-to-br from-red-400/20 to-orange-400/20', text: 'text-red-600 dark:text-red-400' },
};

const RANK_ICONS = [
  <Crown key="1" className="w-5 h-5 text-yellow-500 dark:text-yellow-400" />,
  <Medal key="2" className="w-5 h-5 text-slate-500 dark:text-gray-300" />,
  <Medal key="3" className="w-5 h-5 text-amber-700 dark:text-amber-600" />,
];

export default function Leaderboard() {
  const navigate = useNavigate();
  const { entries, loading } = useLeaderboard();
  const { data: crownsByUser = {} } = useCrownsForUsers(entries.map((e) => e.user_id));
  const { challenges, createChallenge, acceptChallenge, shareChallenge } = useFriendChallenges();
  const [tab, setTab] = useState<'global' | 'challenges'>('global');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [challengeMsg, setChallengeMsg] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const myEntry = entries.find(e => e.is_self);
  const myRank = entries.findIndex(e => e.is_self) + 1;

  const handleCreate = async () => {
    const code = await createChallenge(challengeMsg || undefined);
    if (code) {
      setCreatedCode(code);
      setChallengeMsg('');
    }
  };

  const handleJoin = async () => {
    const result = await acceptChallenge(joinCode);
    if (result.success) {
      toast.success('⚔️ Challenge Accepted!', { description: "Game on! Let's see who wins this week." });
      setShowJoin(false);
      setJoinCode('');
      setTab('challenges');
    } else {
      toast.error(result.error || 'Could not join that challenge.');
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <div className="px-5 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-muted/50">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-h1 text-foreground flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" /> Leaderboard
            </h1>
            <p className="text-caption text-muted-foreground">Weekly Growth Rankings</p>
          </div>
        </div>

        {/* My Score Banner */}
        {myEntry && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass p-4 shadow-card border border-primary/20 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary/30">
                  {visibleAvatarUrl(myEntry.avatar_url) ? (
                    <Avatar url={myEntry.avatar_url} name={myEntry.display_name} size={48} alt="You" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-secondary"><User className="w-6 h-6 text-muted-foreground" /></div>
                  )}
                </div>
                <div>
                  <p className="font-bold text-foreground inline-flex items-center gap-1.5">
                    You ({myEntry.display_name})
                    <StarRating level={myEntry.level} size="xs" />
                  </p>
                  <p className="text-caption text-muted-foreground">Level {myEntry.level} · Rank #{myRank} this week</p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-black ${GRADE_STYLES[myEntry.grade]?.text || 'text-foreground'}`}>{myEntry.growth_score}</div>
                <span className="text-xs text-muted-foreground">Growth Score</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['global', 'challenges'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {t === 'global' ? '🌍 Global' : '⚔️ Challenges'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5">
        <AnimatePresence mode="wait">
          {tab === 'global' ? (
            <motion.div key="global" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)
              ) : entries.length === 0 ? (
                <div className="text-center py-12">
                  <Star className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-foreground font-semibold">No scores yet this week</p>
                  <p className="text-caption text-muted-foreground mt-1">Complete habits to appear on the leaderboard!</p>
                </div>
              ) : (
                entries.map((entry, i) => {
                  const gradeStyle = GRADE_STYLES[entry.grade] || GRADE_STYLES.D;
                  return (
                    <motion.div
                      key={entry.user_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`flex items-center gap-3 p-3 rounded-2xl ${entry.is_self ? 'bg-primary/10 border border-primary/20' : 'bg-card/60'}`}
                    >
                      <div className="w-8 flex-shrink-0 text-center">
                        {i < 3 ? RANK_ICONS[i] : <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>}
                      </div>
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-border flex-shrink-0">
                        {visibleAvatarUrl(entry.avatar_url) ? (
                          <Avatar url={entry.avatar_url} name={entry.display_name} size={40} alt={entry.display_name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary"><User className="w-5 h-5 text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate inline-flex items-center gap-1.5">
                          {entry.display_name} {entry.is_self && '(You)'}
                          <StarRating level={entry.level} size="xs" />
                          {(crownsByUser[entry.user_id] || []).slice(0, 1).map((c) => (
                            <CrownBadge key={c.period_start} place={c.place} size="sm" />
                          ))}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground/70">L{entry.level}</span>
                          <span className="flex items-center gap-0.5"><Flame className="w-3 h-3" /> {entry.best_streak}d</span>
                          <span className="flex items-center gap-0.5"><Target className="w-3 h-3" /> {entry.habits_completed}</span>
                          <span className="flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> {entry.perfect_days} perfect</span>
                        </div>
                      </div>
                      <div className={`flex flex-col items-center px-3 py-1 rounded-xl ${gradeStyle.bg}`}>
                        <span className={`text-lg font-black ${gradeStyle.text}`}>{entry.growth_score}</span>
                        <span className={`text-[10px] font-bold ${gradeStyle.text}`}>{entry.grade}</span>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          ) : (
            <motion.div key="challenges" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowCreate(true); setShowJoin(false); setCreatedCode(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm"
                >
                  <Swords className="w-4 h-4" /> Challenge a Friend
                </button>
                <button
                  onClick={() => { setShowJoin(true); setShowCreate(false); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm"
                >
                  <Plus className="w-4 h-4" /> Join Challenge
                </button>
              </div>

              {/* Create Challenge Panel */}
              <AnimatePresence>
                {showCreate && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass p-4 rounded-2xl shadow-card space-y-3 overflow-hidden">
                    {!createdCode ? (
                      <>
                        <p className="font-semibold text-foreground">⚔️ Create a Challenge</p>
                        <input
                          value={challengeMsg}
                          onChange={e => setChallengeMsg(e.target.value)}
                          placeholder="Add a trash talk message (optional)"
                          className="w-full px-3 py-2 rounded-xl bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground border border-border focus:border-primary outline-none"
                        />
                        <button onClick={handleCreate} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
                          Generate Challenge Code
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-foreground text-center">🎉 Challenge Created!</p>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-2xl font-black tracking-widest text-primary">{createdCode}</span>
                          <button onClick={() => handleCopy(createdCode)} className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                            {copied ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">Share this code with your friend!</p>
                        <button
                          onClick={() => shareChallenge(createdCode, challengeMsg)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm"
                        >
                          <Share2 className="w-4 h-4" /> Share Challenge
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Join Challenge Panel */}
              <AnimatePresence>
                {showJoin && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="glass p-4 rounded-2xl shadow-card space-y-3 overflow-hidden">
                    <p className="font-semibold text-foreground">🤝 Join a Challenge</p>
                    <input
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter 6-letter code"
                      maxLength={6}
                      className="w-full px-3 py-2 rounded-xl bg-muted/50 text-sm text-foreground text-center tracking-widest font-bold placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-normal border border-border focus:border-primary outline-none"
                    />
                    <p className="text-[11px] text-muted-foreground">You must already be friends with the challenge creator before joining.</p>
                    <button
                      onClick={handleJoin}
                      disabled={joinCode.length < 6}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
                    >
                      Accept Challenge ⚔️
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Active Challenges List */}
              {challenges.some(c => ['pending', 'active', 'accepted'].includes(c.status)) ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Challenges</p>
                  {challenges.filter(c => ['pending', 'active', 'accepted'].includes(c.status)).map(c => (
                    <div key={c.id} className="glass p-3 rounded-2xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Swords className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {c.is_challenger ? 'You challenged someone' : 'You were challenged'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.habit_name || 'Weekly Challenge'} • Code: {c.code}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        ['active', 'accepted'].includes(c.status) ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                      }`}>
                        {['active', 'accepted'].includes(c.status) ? '🤝 Active' : '⏳ Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Swords className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No challenges yet. Challenge a friend to get started!</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
