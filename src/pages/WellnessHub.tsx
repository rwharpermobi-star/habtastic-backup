import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Pause, Clock, Leaf, Heart, Wind, Sun, Moon, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import BackgroundMusicControl from '@/components/BackgroundMusicControl';
import WellnessSessionPlayer from '@/components/WellnessSessionPlayer';
import {
  WELLNESS_SESSIONS as SESSIONS,
  type WellnessSession as Session,
  loadWellnessState,
  saveWellnessState,
  loadWellnessHistory,
  type WellnessHistoryEntry,
} from '@/lib/wellnessSessions';

const CATEGORIES = [
  { key: 'all', label: 'All', icon: Sparkles },
  { key: 'meditation', label: 'Meditation', icon: Moon },
  { key: 'yoga', label: 'Yoga', icon: Sun },
  { key: 'breathing', label: 'Breathing', icon: Wind },
] as const;

function getDailyPick(): Session {
  // Stable daily rotation: same pick all day, changes each calendar day.
  const d = new Date();
  const dayKey = Number(`${d.getFullYear()}${d.getMonth() + 1}${d.getDate()}`);
  const idx = dayKey % SESSIONS.length;
  return SESSIONS[idx] ?? SESSIONS[0];
}

export default function WellnessHub() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [restoreRemaining, setRestoreRemaining] = useState<number | undefined>(undefined);
  const [restorePlaying, setRestorePlaying] = useState<boolean>(true);
  const [history, setHistory] = useState<WellnessHistoryEntry[]>([]);
  const dailyPick = useMemo(() => getDailyPick(), []);

  const refreshHistory = () => setHistory(loadWellnessHistory());
  useEffect(() => {
    refreshHistory();
  }, []);

  // Restore persisted session on mount
  useEffect(() => {
    const persisted = loadWellnessState();
    if (persisted && SESSIONS.find((s) => s.id === persisted.sessionId)) {
      setRestoreRemaining(persisted.remaining);
      setRestorePlaying(persisted.playing);
      setActiveSession(persisted.sessionId);
      toast.info('Resumed your wellness session');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = activeCategory === 'all' ? SESSIONS : SESSIONS.filter(s => s.category === activeCategory);

  // Duck background music while a guided session is active
  useEffect(() => {
    if (activeSession) {
      window.dispatchEvent(new Event('bg-music:duck'));
    } else {
      window.dispatchEvent(new Event('bg-music:unduck'));
    }
    return () => {
      window.dispatchEvent(new Event('bg-music:unduck'));
    };
  }, [activeSession]);

  const startSession = (session: Session) => {
    setRestoreRemaining(undefined);
    setRestorePlaying(true);
    setActiveSession(session.id);
    toast.success(`Starting: ${session.title} ${session.emoji}`);
  };

  const handlePlay = (session: Session) => {
    if (activeSession === session.id) {
      setActiveSession(null);
      saveWellnessState(null);
      toast.info(`Paused: ${session.title}`);
    } else {
      startSession(session);
    }
  };

  const currentSession = SESSIONS.find((s) => s.id === activeSession) ?? null;

  const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
  const cardAnim = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <motion.div
      className="min-h-screen pb-24 bg-background"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-xl hover:bg-secondary/60 transition-colors">
          <ChevronLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-body-lg font-bold text-foreground">Wellness Hub</h1>
          <p className="text-caption text-muted-foreground">Mind · Body · Breath</p>
        </div>
        <BackgroundMusicControl />
      </div>

      {/* Featured card */}
      <div className="px-4 pt-4">
        <div className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-[#7C4DFF] to-[#448AFF] p-5 shadow-card">
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Leaf className="w-5 h-5 text-white/80" />
              <span className="text-caption text-white/70 font-medium">Daily Pick</span>
            </div>
            <h2 className="text-body-lg font-bold text-white mb-1">{dailyPick.emoji} {dailyPick.title}</h2>
            <p className="text-caption text-white/70 mb-4">{dailyPick.duration} min · {dailyPick.description}</p>
            <button
              onClick={() => handlePlay(dailyPick)}
              className="flex items-center gap-2 px-4 py-2 rounded-btn bg-white/20 backdrop-blur text-white text-caption font-semibold active:scale-95 transition-transform"
            >
              {activeSession === dailyPick.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {activeSession === dailyPick.id ? 'Pause' : 'Start Session'}
            </button>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="px-4 mt-5 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-btn text-caption font-medium whitespace-nowrap transition-all ${
              activeCategory === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      <motion.div className="px-4 mt-4 space-y-3" variants={stagger} initial="hidden" animate="visible">
        {filtered.map((session) => (
          <motion.button
            key={session.id}
            variants={cardAnim}
            onClick={() => handlePlay(session)}
            className="w-full glass rounded-[1rem] p-4 flex items-center gap-4 text-left shadow-card active:scale-[0.98] transition-transform"
          >
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${session.gradient} flex items-center justify-center flex-shrink-0`}>
              <span className="text-xl">{session.emoji}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-body text-foreground truncate">{session.title}</p>
              <p className="text-caption text-muted-foreground truncate">{session.description}</p>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-caption text-muted-foreground">{session.duration} min</span>
              </div>
            </div>
            <div className="flex-shrink-0">
              {activeSession === session.id ? (
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                  <Pause className="w-4 h-4 text-primary" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center">
                  <Play className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Stats */}
      <div className="px-4 mt-6 mb-4">
        <div className="glass rounded-[1rem] p-4 shadow-card">
          <p className="text-caption text-muted-foreground font-semibold mb-3">Your Wellness Stats</p>
          <div className="flex items-center justify-around">
            <div className="text-center">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
                <Heart className="w-5 h-5 text-primary" />
              </div>
              <p className="font-bold text-body text-foreground">{history.length}</p>
              <p className="text-caption text-muted-foreground">Sessions</p>
            </div>
            <div className="w-px h-12 bg-border/40" />
            <div className="text-center">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-1.5">
                <Clock className="w-5 h-5 text-accent" />
              </div>
              <p className="font-bold text-body text-foreground">
                {history.reduce((sum, h) => sum + h.duration, 0)}m
              </p>
              <p className="text-caption text-muted-foreground">Minutes</p>
            </div>
            <div className="w-px h-12 bg-border/40" />
            <div className="text-center">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-1.5">
                <Leaf className="w-5 h-5 text-success" />
              </div>
              <p className="font-bold text-body text-foreground">
                {history.filter((h) => h.feeling).length}
              </p>
              <p className="text-caption text-muted-foreground">Reflections</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div className="px-4 mb-6">
          <p className="text-caption text-muted-foreground font-semibold mb-2 px-1">
            Recent sessions
          </p>
          <div className="space-y-2">
            {history.slice(0, 5).map((h) => {
              const feelingEmoji =
                h.feeling === 'great' ? '🤩'
                : h.feeling === 'good' ? '🙂'
                : h.feeling === 'okay' ? '😐'
                : h.feeling === 'meh' ? '😕'
                : null;
              return (
                <div key={h.id} className="glass rounded-[1rem] p-3 flex items-start gap-3 shadow-card">
                  <div className="w-9 h-9 rounded-xl bg-secondary/60 flex items-center justify-center flex-shrink-0 text-lg">
                    {h.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-caption text-foreground truncate">{h.title}</p>
                      {feelingEmoji && <span className="text-base flex-shrink-0">{feelingEmoji}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {h.duration} min · {new Date(h.completedAt).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                    {h.note && (
                      <p className="text-caption text-foreground/80 mt-1 line-clamp-2">"{h.note}"</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <WellnessSessionPlayer
        session={currentSession}
        initialRemaining={restoreRemaining}
        initialPlaying={restorePlaying}
        onClose={() => {
          setActiveSession(null);
          setRestoreRemaining(undefined);
          setRestorePlaying(true);
          refreshHistory();
        }}
        onComplete={(s) => {
          toast.success(`Session complete: ${s.title} ✨`);
          refreshHistory();
        }}
        onSelectNext={(s) => startSession(s)}
      />
    </motion.div>
  );
}
