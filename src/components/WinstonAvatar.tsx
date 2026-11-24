import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import winstonIdle from '@/assets/winston-idle.jpg';
import winstonHappy from '@/assets/winston-happy.jpg';
import winstonThinking from '@/assets/winston-thinking.jpg';
import winstonRockstar from '@/assets/winston-rockstar.jpg';

export type WinstonMood =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'celebrating'
  | 'encouraging'
  | 'sad';

export type CelebrationTempo = 'slow' | 'normal' | 'fast';

interface Props {
  mood: WinstonMood;
  size?: number;
  onTap?: () => void;
  disabled?: boolean;
  className?: string;
  /** Render as a plain div (for embedding inside another button). */
  asDiv?: boolean;
  /** Tempo for celebration guitar strumming. Defaults to 'normal'. */
  celebrationTempo?: CelebrationTempo;
}

const TEMPO_MULT: Record<CelebrationTempo, number> = {
  slow: 1.5,
  normal: 1,
  fast: 0.65,
};

// Low-end device heuristic — reduce particle counts + heavy blurs.
function detectLowEnd(): boolean {
  if (typeof navigator === 'undefined') return false;
  const mem = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency || 8;
  return (typeof mem === 'number' && mem <= 4) || cores <= 4;
}

const MOOD_IMAGE: Record<WinstonMood, string> = {
  idle: winstonIdle,
  listening: winstonHappy,
  thinking: winstonThinking,
  speaking: winstonIdle,
  happy: winstonHappy,
  celebrating: winstonRockstar,
  encouraging: winstonIdle,
  sad: winstonThinking,
};

// Idle micro-actions rotate randomly so Winston never feels frozen.
type Micro = 'breathe' | 'sway' | 'wingWave' | 'look' | 'wiggle';
const MICRO_LIST: Micro[] = ['breathe', 'sway', 'wingWave', 'look', 'wiggle'];

export default function WinstonAvatar({ mood, size = 160, onTap, disabled, className = '', asDiv = false, celebrationTempo = 'normal' }: Props) {
  const prefersReduced = useReducedMotion();
  const lowEnd = useMemo(detectLowEnd, []);
  const tempoMult = TEMPO_MULT[celebrationTempo];
  const [blink, setBlink] = useState(false);
  const [micro, setMicro] = useState<Micro>('breathe');
  const [tapAnim, setTapAnim] = useState<null | 'wave' | 'thumbs' | 'wink'>(null);
  const tapTimer = useRef<number | null>(null);

  // Random blink every 3–6s
  useEffect(() => {
    if (prefersReduced) return;
    let alive = true;
    const loop = () => {
      const wait = 2800 + Math.random() * 3200;
      window.setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        window.setTimeout(() => alive && setBlink(false), 130);
        loop();
      }, wait);
    };
    loop();
    return () => { alive = false; };
  }, [prefersReduced]);

  // Rotate idle micro-actions every ~4s while idle
  useEffect(() => {
    if (prefersReduced || (mood !== 'idle' && mood !== 'encouraging')) return;
    const t = window.setInterval(() => {
      setMicro(MICRO_LIST[Math.floor(Math.random() * MICRO_LIST.length)]);
    }, 4000);
    return () => window.clearInterval(t);
  }, [mood, prefersReduced]);

  // Pause when tab hidden to save battery
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const anim = useMemo(() => {
    if (prefersReduced || paused) return { scale: 1, y: 0, rotate: 0, x: 0 };
    switch (mood) {
      case 'listening':
        // Lean forward toward user
        return { scale: [1, 1.03, 1], y: [0, -3, 0], rotate: [0, -2, 0], x: 0 };
      case 'thinking':
        return { scale: [1, 1.01, 1], y: [0, -1, 0], rotate: [-1.5, 1.5, -1.5], x: 0 };
      case 'speaking':
        // Head bob synced roughly to speech cadence
        return { scale: [1, 1.02, 1], y: [0, -2, 0, -1, 0], rotate: [0, 1, -1, 0], x: 0 };
      case 'happy':
        return { scale: [1, 1.08, 1], y: [0, -10, 0], rotate: [0, -6, 6, 0], x: 0 };
      case 'celebrating':
        // Rockstar guitar-strum rhythm: quick head-bang + body rock in tempo
        return { scale: [1, 1.03, 1, 1.03, 1], y: [0, -6, 0, -4, 0], rotate: [-4, 4, -3, 3, -4], x: [0, -2, 0, 2, 0] };
      case 'encouraging':
        return { scale: [1, 1.04, 1], y: [0, -4, 0], rotate: 0, x: 0 };
      case 'sad':
        return { scale: 1, y: [0, 1.5, 0], rotate: 0, x: 0 };
      case 'idle':
      default:
        // Idle micro-actions
        switch (micro) {
          case 'sway':    return { scale: 1, y: 0, rotate: [0, 1.5, -1.5, 0], x: [0, 2, -2, 0] };
          case 'wingWave':return { scale: [1, 1.02, 1], y: [0, -2, 0], rotate: [0, -3, 0], x: 0 };
          case 'look':    return { scale: 1, y: 0, rotate: [0, 0.8, -0.8, 0], x: 0 };
          case 'wiggle':  return { scale: [1, 1.015, 1], y: 0, rotate: [0, 0.5, -0.5, 0], x: 0 };
          case 'breathe':
          default:        return { scale: [1, 1.025, 1], y: [0, -2, 0], rotate: 0, x: 0 };
        }
    }
  }, [mood, micro, prefersReduced, paused]);

  const duration = useMemo(() => {
    switch (mood) {
      case 'listening': return 1.6;
      case 'thinking':  return 1.8;
      case 'speaking':  return 0.55;
      case 'happy':       return 0.9;
      case 'celebrating': return 0.6 * tempoMult;
      case 'encouraging': return 1.4;
      case 'sad':       return 3.2;
      default:          return 3.4;
    }
  }, [mood, tempoMult]);

  const img = MOOD_IMAGE[mood];

  function handleTap() {
    if (disabled) return;
    // Cycle friendly reactions on tap
    const opts: Array<'wave' | 'thumbs' | 'wink'> = ['wave', 'thumbs', 'wink'];
    const pick = opts[Math.floor(Math.random() * opts.length)];
    setTapAnim(pick);
    if (tapTimer.current) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => setTapAnim(null), 900);
    onTap?.();
  }

  // Glow color per mood
  const glow = mood === 'listening'
    ? 'shadow-[0_0_0_10px_hsl(var(--success)/0.18),0_0_60px_10px_hsl(var(--success)/0.45)]'
    : mood === 'thinking'
    ? 'shadow-[0_0_0_8px_hsl(var(--accent)/0.15),0_0_40px_6px_hsl(var(--accent)/0.35)]'
    : mood === 'speaking'
    ? 'shadow-[0_0_0_10px_hsl(var(--primary)/0.18),0_0_50px_8px_hsl(var(--primary)/0.45)]'
    : mood === 'happy' || mood === 'celebrating'
    ? 'shadow-[0_0_0_12px_hsl(var(--primary)/0.22),0_0_60px_10px_hsl(var(--primary)/0.55)]'
    : 'shadow-[0_0_28px_4px_hsl(var(--primary)/0.28)]';

  const Tag: any = asDiv ? motion.div : motion.button;
  const rootProps: any = asDiv
    ? { onClick: handleTap, 'aria-hidden': true }
    : { type: 'button', onClick: handleTap, disabled, whileTap: { scale: 0.94 }, 'aria-label': `Winston is ${mood}. Tap to greet.` };

  return (
    <Tag
      {...rootProps}
      className={`relative rounded-full overflow-hidden bg-[#0a1633] border-2 border-primary/30 select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 ${glow} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Character image with mood-driven motion. Keyed on mood so the
          previous mood's animate track is torn down immediately (no
          lingering strum tempo when leaving 'celebrating'). */}
      <motion.div
        key={`motion-${mood}`}
        className="absolute inset-0"
        style={{ willChange: 'transform' }}
        animate={paused ? { scale: 1, y: 0, rotate: 0, x: 0 } : anim}
        transition={{
          duration,
          repeat: prefersReduced || paused ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={img}
            src={img}
            alt="Winston"
            className="w-full h-full object-cover object-top pointer-events-none"
            draggable={false}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
          />
        </AnimatePresence>
      </motion.div>

      {/* Blink overlay — a thin horizontal band across the eyes */}
      {!prefersReduced && (
        <motion.div
          aria-hidden
          className="absolute left-[18%] right-[18%] rounded-full bg-[#0a1633]"
          style={{ top: '30%', height: '6%' }}
          animate={{ scaleY: blink ? 1 : 0.05, opacity: blink ? 0.95 : 0 }}
          transition={{ duration: 0.08 }}
        />
      )}

      {/* Beak-move overlay while speaking (small pulse near beak) */}
      {mood === 'speaking' && !prefersReduced && (
        <motion.div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-orange-400/70 blur-[2px]"
          style={{ top: '46%', width: '10%', height: '5%' }}
          animate={{ scaleY: [0.5, 1.4, 0.5], opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 0.22, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Guitar performance overlays — only while the rockstar pose is
          visible AND the mood image is the rockstar shot. Wrapped in
          AnimatePresence so every overlay unmounts immediately when mood
          leaves 'celebrating' — no strum motion lingers over the next pose. */}
      <AnimatePresence>
        {mood === 'celebrating' && img === winstonRockstar && !prefersReduced && (
          <motion.div
            key="guitar-fx"
            className="absolute inset-0 pointer-events-none"
            style={{ willChange: 'opacity' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Strum-hand pulse over the guitar body (bottom-center).
                Lighter blur on low-end devices to stay at 60fps. */}
            <motion.div
              aria-hidden
              className={`absolute left-[38%] right-[38%] rounded-full bg-primary/40 mix-blend-screen ${lowEnd ? 'blur-sm' : 'blur-md'}`}
              style={{ top: '62%', height: '10%', willChange: 'transform, opacity' }}
              animate={{ scale: [0.9, 1.25, 0.9, 1.15, 0.9], opacity: [0.35, 0.9, 0.35, 0.75, 0.35] }}
              transition={{ duration: 0.6 * tempoMult, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* Fretboard finger taps — 2 sparks on low-end, 3 otherwise */}
            {(lowEnd ? [0, 1] : [0, 1, 2]).map((i) => (
              <motion.span
                key={`fret-${i}`}
                aria-hidden
                className="absolute w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_2px_hsl(var(--accent))]"
                style={{ top: '58%', left: `${28 + i * 8}%`, willChange: 'transform, opacity' }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0.6, 1.2, 0.6],
                  y: [0, -2, 0],
                }}
                transition={{
                  duration: 0.6 * tempoMult,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.15 * tempoMult,
                }}
              />
            ))}
            {/* Motion streaks across strings on each strum */}
            <motion.div
              aria-hidden
              className="absolute left-[30%] right-[30%] h-[2px] bg-gradient-to-r from-transparent via-white/70 to-transparent"
              style={{ top: '64%', willChange: 'transform, opacity' }}
              animate={{ opacity: [0, 0.9, 0], scaleX: [0.6, 1, 0.6] }}
              transition={{ duration: 0.3 * tempoMult, repeat: Infinity, ease: 'easeOut', repeatDelay: 0.3 * tempoMult }}
            />
            {/* Floating music notes — 2 on low-end, 3 otherwise */}
            {(lowEnd ? ['♪', '♫'] : ['♪', '♫', '♩']).map((note, i, arr) => (
              <motion.span
                key={`note-${i}`}
                aria-hidden
                className="absolute text-primary font-bold pointer-events-none"
                style={{ top: '30%', left: `${20 + i * (arr.length === 2 ? 40 : 25)}%`, fontSize: size * 0.11, willChange: 'transform, opacity' }}
                animate={{
                  y: [0, -size * 0.35],
                  x: [0, (i - 1) * 12],
                  opacity: [0, 1, 0],
                  rotate: [-10, 10, -10],
                }}
                transition={{
                  duration: 1.8 * tempoMult,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: i * 0.6 * tempoMult,
                }}
              >
                {note}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tap reactions */}
      <AnimatePresence>
        {tapAnim === 'wave' && (
          <motion.div
            key="wave"
            className="absolute top-2 right-2 text-2xl"
            initial={{ opacity: 0, y: 10, rotate: -20 }}
            animate={{ opacity: 1, y: 0, rotate: [0, 20, -10, 15, 0] }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.8 }}
          >👋</motion.div>
        )}
        {tapAnim === 'thumbs' && (
          <motion.div
            key="thumbs"
            className="absolute bottom-3 right-3 text-2xl"
            initial={{ opacity: 0, scale: 0.4, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: -6 }}
            transition={{ duration: 0.35 }}
          >👍</motion.div>
        )}
        {tapAnim === 'wink' && (
          <motion.div
            key="wink"
            className="absolute top-3 left-3 text-xl"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.3 }}
          >😉</motion.div>
        )}
      </AnimatePresence>

      {/* Celebration confetti */}
      <AnimatePresence>
        {mood === 'celebrating' && !prefersReduced && (
          <motion.div
            key="confetti"
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 14 }).map((_, i) => {
              const colors = ['#22d3ee', '#a3e635', '#f59e0b', '#ec4899', '#8b5cf6'];
              const c = colors[i % colors.length];
              const x = (Math.random() - 0.5) * size * 0.9;
              const y = -size * (0.4 + Math.random() * 0.5);
              return (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: c }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x, y, opacity: 0, scale: 0.6, rotate: 360 }}
                  transition={{ duration: 1.1, ease: 'easeOut', delay: i * 0.02 }}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </Tag>
  );
}
