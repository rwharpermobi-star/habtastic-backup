import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, Loader2, Volume2 } from 'lucide-react';
import {
  WellnessSession,
  saveWellnessState,
  getNextSuggestion,
  appendWellnessHistory,
  updateWellnessHistoryEntry,
  type WellnessFeeling,
} from '@/lib/wellnessSessions';

interface Props {
  session: WellnessSession | null;
  initialRemaining?: number; // seconds, when restoring
  initialPlaying?: boolean;
  onClose: () => void;
  onComplete?: (s: WellnessSession) => void;
  onSelectNext?: (s: WellnessSession) => void;
}

const AMBIENT: Record<WellnessSession['category'], number[]> = {
  meditation: [110, 165],
  yoga: [146.83, 220],
  breathing: [98, 130.81],
};

type Phase = 'loading' | 'blocked' | 'playing' | 'paused' | 'feedback' | 'finished';

export default function WellnessSessionPlayer({
  session,
  initialRemaining,
  initialPlaying = true,
  onClose,
  onComplete,
  onSelectNext,
}: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [remaining, setRemaining] = useState(0);
  const [feeling, setFeeling] = useState<WellnessFeeling | null>(null);
  const [note, setNote] = useState('');
  const historyIdRef = useRef<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const oscsRef = useRef<OscillatorNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const finishedSessionRef = useRef<WellnessSession | null>(null);

  // Init when session changes
  useEffect(() => {
    if (!session) return;
    const startSecs =
      initialRemaining && initialRemaining > 0
        ? initialRemaining
        : session.duration * 60;
    setRemaining(startSecs);
    setPhase('loading');
    setFeeling(null);
    setNote('');
    historyIdRef.current = null;
    finishedSessionRef.current = null;
    initAudio(session.category, initialPlaying);
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Countdown
  useEffect(() => {
    if (!session || phase !== 'playing') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          stopAudio();
          finishedSessionRef.current = session;
          // Record into history right away (without feeling/note yet)
          const id = `${session.id}-${Date.now()}`;
          historyIdRef.current = id;
          appendWellnessHistory({
            id,
            sessionId: session.id,
            title: session.title,
            emoji: session.emoji,
            category: session.category,
            duration: session.duration,
            completedAt: Date.now(),
          });
          setPhase('feedback');
          saveWellnessState(null);
          onComplete?.(session);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, session?.id]);

  // Persist state every second while open (not finished)
  useEffect(() => {
    if (!session) return;
    if (phase === 'finished' || phase === 'loading' || phase === 'feedback') return;
    saveWellnessState({
      sessionId: session.id,
      remaining,
      playing: phase === 'playing',
      savedAt: Date.now(),
    });
  }, [remaining, phase, session]);

  // Save before unload
  useEffect(() => {
    const handler = () => {
      if (session && phase !== 'finished' && phase !== 'feedback') {
        saveWellnessState({
          sessionId: session.id,
          remaining,
          playing: phase === 'playing',
          savedAt: Date.now(),
        });
      }
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
    };
  }, [session, remaining, phase]);

  const initAudio = async (cat: WellnessSession['category'], shouldPlay: boolean) => {
    try {
      const AC =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : (window as any).webkitAudioContext;
      if (!AC) {
        // No audio support — still allow visual session
        setPhase(shouldPlay ? 'playing' : 'paused');
        return;
      }
      const ctx: AudioContext = new AC();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.connect(ctx.destination);
      gainRef.current = master;

      AMBIENT[cat].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, ctx.currentTime);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.5, ctx.currentTime);
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.2, ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        lfo.start();
        o.connect(g);
        g.connect(master);
        o.start();
        oscsRef.current.push(o, lfo);
      });

      // Try to resume if browser suspended it (no user gesture yet)
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch { /* ignore: best effort */ }
      }

      if (ctx.state === 'suspended') {
        // Browser blocked — show resume prompt
        setPhase('blocked');
        return;
      }

      // Fade in
      master.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.0);

      // Brief loading window so user sees the indicator
      window.setTimeout(() => {
        setPhase(shouldPlay ? 'playing' : 'paused');
        if (!shouldPlay) {
          ctx.suspend().catch(() => {});
        }
      }, 350);
    } catch (e) {
      console.error('Audio init failed', e);
      setPhase(shouldPlay ? 'playing' : 'paused');
    }
  };

  const handleResumeBlocked = async () => {
    const ctx = ctxRef.current;
    if (!ctx) {
      setPhase('playing');
      return;
    }
    try {
      await ctx.resume();
      gainRef.current?.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.0);
      setPhase('playing');
    } catch {
      setPhase('playing');
    }
  };

  const stopAudio = () => {
    try {
      const ctx = ctxRef.current;
      if (gainRef.current && ctx) {
        gainRef.current.gain.cancelScheduledValues(ctx.currentTime);
        gainRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      }
      setTimeout(() => {
        oscsRef.current.forEach((o) => {
          try {
            o.stop();
            o.disconnect();
          } catch { /* ignore: best effort */ }
        });
        oscsRef.current = [];
        ctxRef.current?.close().catch(() => {});
        ctxRef.current = null;
        gainRef.current = null;
      }, 500);
    } catch { /* ignore: best effort */ }
  };

  const togglePlay = async () => {
    const ctx = ctxRef.current;
    if (phase === 'playing') {
      ctx?.suspend().catch(() => {});
      setPhase('paused');
    } else if (phase === 'paused') {
      try {
        await ctx?.resume();
        setPhase('playing');
      } catch {
        setPhase('playing');
      }
    }
  };

  const handleClose = () => {
    if (session && phase !== 'finished' && phase !== 'feedback') {
      saveWellnessState({
        sessionId: session.id,
        remaining,
        playing: false,
        savedAt: Date.now(),
      });
    } else {
      saveWellnessState(null);
    }
    stopAudio();
    onClose();
  };

  const saveFeedback = (skip = false) => {
    const id = historyIdRef.current;
    if (id && !skip) {
      updateWellnessHistoryEntry(id, {
        feeling: feeling ?? undefined,
        note: note.trim() || undefined,
      });
    }
    setPhase('finished');
  };

  const handlePickNext = () => {
    const finished = finishedSessionRef.current;
    if (!finished) return;
    const next = getNextSuggestion(finished.id);
    onSelectNext?.(next);
  };

  if (!session) return null;

  const totalSec = session.duration * 60;
  const progress = 1 - remaining / totalSec;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  const finishedSession = finishedSessionRef.current;
  const nextSuggestion = finishedSession ? getNextSuggestion(finishedSession.id) : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${session.gradient}`} />
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

        <button
          onClick={handleClose}
          aria-label="Close session"
          className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform z-20"
        >
          <X className="w-5 h-5" />
        </button>

        {/* FEEDBACK — How did that feel? */}
        {phase === 'feedback' && finishedSession && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative z-10 flex flex-col items-center text-center text-white max-w-sm w-full"
          >
            <div className="text-5xl mb-3">{finishedSession.emoji}</div>
            <h2 className="text-2xl font-bold mb-1">How did that feel?</h2>
            <p className="text-sm text-white/80 mb-6">{finishedSession.title}</p>

            <div className="w-full glass rounded-2xl p-4 bg-white/15 backdrop-blur border border-white/20 mb-4">
              <div className="grid grid-cols-4 gap-2 mb-4">
                {([
                  { key: 'great', emoji: '🤩', label: 'Great' },
                  { key: 'good', emoji: '🙂', label: 'Good' },
                  { key: 'okay', emoji: '😐', label: 'Okay' },
                  { key: 'meh', emoji: '😕', label: 'Meh' },
                ] as { key: WellnessFeeling; emoji: string; label: string }[]).map((f) => {
                  const active = feeling === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setFeeling(f.key)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all active:scale-95 ${
                        active
                          ? 'bg-white text-foreground shadow-md'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                      aria-pressed={active}
                    >
                      <span className="text-xl">{f.emoji}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide">
                        {f.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 240))}
                placeholder="Add a quick note (optional)…"
                rows={3}
                className="w-full resize-none rounded-xl bg-white/10 placeholder-white/50 text-white text-sm px-3 py-2 outline-none focus:bg-white/15 border border-white/15"
              />
              <p className="text-[10px] text-white/50 mt-1 text-right">{note.length}/240</p>
            </div>

            <div className="w-full flex gap-2">
              <button
                onClick={() => saveFeedback(true)}
                className="flex-1 h-11 rounded-full bg-white/15 text-white font-semibold active:scale-95 transition-transform"
              >
                Skip
              </button>
              <button
                onClick={() => saveFeedback(false)}
                className="flex-1 h-11 rounded-full bg-white text-foreground font-semibold active:scale-95 transition-transform"
              >
                Save
              </button>
            </div>
          </motion.div>
        )}

        {/* FINISHED — Next up screen */}
        {phase === 'finished' && finishedSession && nextSuggestion && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative z-10 flex flex-col items-center text-center text-white max-w-sm w-full"
          >
            <div className="text-5xl mb-4">✨</div>
            <h2 className="text-2xl font-bold mb-1">Session complete</h2>
            <p className="text-sm text-white/80 mb-8">{finishedSession.title}</p>

            <div className="w-full glass rounded-2xl p-4 bg-white/15 backdrop-blur border border-white/20 mb-6">
              <p className="text-xs uppercase tracking-widest text-white/70 mb-3">Next up</p>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${nextSuggestion.gradient} flex items-center justify-center flex-shrink-0`}
                >
                  <span className="text-xl">{nextSuggestion.emoji}</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">{nextSuggestion.title}</p>
                  <p className="text-xs text-white/70">
                    {nextSuggestion.duration} min · {nextSuggestion.category}
                  </p>
                </div>
              </div>
              <button
                onClick={handlePickNext}
                className="w-full h-11 rounded-full bg-white text-foreground font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Play className="w-4 h-4" />
                Start next session
              </button>
            </div>

            <button
              onClick={handleClose}
              className="text-sm text-white/80 underline-offset-2 hover:underline"
            >
              Done for now
            </button>
          </motion.div>
        )}

        {/* ACTIVE / LOADING / BLOCKED / PAUSED */}
        {phase !== 'finished' && phase !== 'feedback' && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative z-10 flex flex-col items-center text-center text-white max-w-sm"
          >
            <motion.div
              animate={{ scale: phase === 'playing' ? [1, 1.25, 1] : 1 }}
              transition={{
                duration: session.category === 'breathing' ? 8 : 6,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative w-48 h-48 mb-8"
            >
              <div className="absolute inset-0 rounded-full bg-white/20 backdrop-blur-md" />
              <div className="absolute inset-4 rounded-full bg-white/15" />
              <div className="absolute inset-0 flex items-center justify-center text-6xl">
                {session.emoji}
              </div>
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 48}
                  strokeDashoffset={2 * Math.PI * 48 * (1 - progress)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
            </motion.div>

            <h2 className="text-2xl font-bold mb-1">{session.title}</h2>
            <p className="text-sm text-white/80 mb-6 px-4">{session.description}</p>

            <div className="text-5xl font-bold tabular-nums tracking-wide mb-2">
              {mm}:{ss}
            </div>

            {phase === 'loading' && (
              <p className="text-xs text-white/80 mb-8 uppercase tracking-widest flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Starting session…
              </p>
            )}

            {phase === 'blocked' && (
              <div className="mb-8 flex flex-col items-center gap-3">
                <p className="text-xs text-white/80 uppercase tracking-widest">
                  Audio blocked by browser
                </p>
                <button
                  onClick={handleResumeBlocked}
                  className="h-11 px-5 rounded-full bg-white text-foreground font-semibold flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Volume2 className="w-4 h-4" />
                  Tap to enable sound
                </button>
              </div>
            )}

            {(phase === 'playing' || phase === 'paused') && (
              <p className="text-xs text-white/70 mb-8 uppercase tracking-widest">
                {session.category === 'breathing'
                  ? phase === 'playing'
                    ? 'Breathe with the orb'
                    : 'Paused'
                  : phase === 'playing'
                  ? 'In session'
                  : 'Paused'}
              </p>
            )}

            {(phase === 'playing' || phase === 'paused') && (
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-white text-foreground flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                aria-label={phase === 'playing' ? 'Pause' : 'Resume'}
              >
                {phase === 'playing' ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
              </button>
            )}
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
