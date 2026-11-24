import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Trophy, X } from 'lucide-react';
import { useConfetti } from '@/hooks/useConfetti';
import { vibrateSuccess } from '@/lib/haptics';

interface PerfectDayCelebrationProps {
  open: boolean;
  onClose: () => void;
  /** Optional Winston message override */
  message?: string;
  /** How many habits were completed today */
  count?: number;
}

const ENCOURAGEMENTS = [
  "You crushed today. Every single habit — done.",
  "That's what consistency looks like. Beautiful work.",
  "Perfect day unlocked. Winston is proud.",
  "You showed up for yourself. That's everything.",
  "Momentum is yours. Ride it into tomorrow.",
];

/**
 * Full-screen premium celebration when the user completes every habit due today.
 * - Tap anywhere to dismiss
 * - Auto-dismisses after 4s
 * - Confetti + glowing badge + Winston message
 * - Respects reduced-motion via CSS-level opt-outs
 */
export default function PerfectDayCelebration({
  open,
  onClose,
  message,
  count,
}: PerfectDayCelebrationProps) {
  const { fireConfetti } = useConfetti();

  const winstonLine = useMemo(
    () => message ?? ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)],
    [message, open],
  );

  useEffect(() => {
    if (!open) return;
    vibrateSuccess();
    fireConfetti();
    const t = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(t);
  }, [open, fireConfetti, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 cursor-pointer"
          role="dialog"
          aria-label="Perfect day celebration"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0, 212, 199, 0.28) 0%, rgba(124, 77, 255, 0.22) 35%, rgba(20, 33, 61, 0.92) 75%)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {/* Skip hint */}
          <button
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:bg-white/20 transition"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Concentric glow rings */}
          <div className="relative flex items-center justify-center mb-8">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute rounded-full border-2 border-primary/40"
                initial={{ width: 120, height: 120, opacity: 0.6 }}
                animate={{
                  width: [120, 260, 340],
                  height: [120, 260, 340],
                  opacity: [0.7, 0.2, 0],
                }}
                transition={{
                  duration: 2.2,
                  delay: i * 0.35,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              />
            ))}

            {/* Trophy badge */}
            <motion.div
              initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{
                type: 'spring',
                stiffness: 220,
                damping: 14,
                delay: 0.1,
              }}
              className="relative z-10 h-28 w-28 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #00D4C7 0%, #7C4DFF 100%)',
                boxShadow:
                  '0 0 40px hsl(176 100% 42% / 0.6), 0 0 80px hsl(255 100% 65% / 0.35), inset 0 2px 0 rgba(255,255,255,0.25)',
              }}
            >
              <Trophy className="w-14 h-14 text-white drop-shadow" strokeWidth={2.2} />
              <motion.span
                className="absolute -top-2 -right-2"
                animate={{ rotate: [0, 20, -10, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                <Sparkles className="w-6 h-6 text-yellow-300 drop-shadow" />
              </motion.span>
            </motion.div>
          </div>

          {/* Title */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 18 }}
            className="text-4xl sm:text-5xl font-display font-bold text-center mb-3"
            style={{
              background: 'linear-gradient(135deg, #FFFFFF 0%, #A5F3FC 50%, #C4B5FD 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: '0 0 30px rgba(0, 212, 199, 0.5)',
            }}
          >
            Perfect Day!
          </motion.h1>

          {/* Count chip */}
          {typeof count === 'number' && count > 0 && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35, type: 'spring', stiffness: 250, damping: 16 }}
              className="chip chip-primary mb-4"
            >
              <Sparkles className="chip-icon" />
              {count} {count === 1 ? 'habit' : 'habits'} complete
            </motion.div>
          )}

          {/* Winston line */}
          <motion.p
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="max-w-sm text-center text-white/90 text-base sm:text-lg leading-relaxed"
          >
            {winstonLine}
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1.2 }}
            className="mt-8 text-xs text-white/60 tracking-wide uppercase"
          >
            Tap anywhere to continue
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
