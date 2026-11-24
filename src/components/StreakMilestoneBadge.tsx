import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface StreakMilestoneBadgeProps {
  milestone: number;
  emoji: string;
  message: string;
  onClose: () => void;
}

const BADGE_COLORS: Record<number, { ring: string; bg: string; glow: string }> = {
  5:   { ring: 'ring-primary/50',   bg: 'bg-primary/15',   glow: 'bg-primary/25' },
  7:   { ring: 'ring-accent/40',    bg: 'bg-accent/10',    glow: 'bg-accent/20' },
  14:  { ring: 'ring-accent/50',    bg: 'bg-accent/15',    glow: 'bg-accent/25' },
  21:  { ring: 'ring-accent/60',    bg: 'bg-accent/20',    glow: 'bg-accent/30' },
  30:  { ring: 'ring-accent/70',    bg: 'bg-accent/20',    glow: 'bg-accent/35' },
  50:  { ring: 'ring-accent/80',    bg: 'bg-accent/25',    glow: 'bg-accent/40' },
  100: { ring: 'ring-accent/90',   bg: 'bg-accent/30',    glow: 'bg-accent/50' },
};

export default function StreakMilestoneBadge({ milestone, emoji, message, onClose }: StreakMilestoneBadgeProps) {
  // The 3-day milestone is now represented by the normal compact completion
  // feedback instead of opening a second full-screen celebration.
  const hidden = milestone <= 3;
  const [show, setShow] = useState(true);
  const colors = BADGE_COLORS[milestone] ?? BADGE_COLORS[7];

  useEffect(() => {
    if (hidden) return;
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onClose, 400);
    }, 6000);
    return () => clearTimeout(timer);
  }, [onClose, hidden]);

  const handleClose = () => {
    setShow(false);
    setTimeout(onClose, 400);
  };

  if (hidden) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="milestone"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
        >
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={handleClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', damping: 15, stiffness: 250 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="relative pointer-events-auto max-w-xs w-full mx-4">
              <div className={`absolute -inset-4 rounded-full ${colors.glow} blur-3xl opacity-60`} />
              <div className="relative overflow-hidden rounded-3xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl p-8 text-center">
                <button onClick={handleClose} className="absolute top-3 right-3 text-muted-foreground/60 hover:text-foreground p-1 transition-colors" aria-label="Close streak celebration">
                  <X className="w-4 h-4" />
                </button>
                <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.15 }} className="mx-auto mb-5">
                  <div className={`w-24 h-24 rounded-full ${colors.bg} ring-4 ${colors.ring} flex items-center justify-center mx-auto`}>
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.35 }} className="text-5xl">{emoji}</motion.span>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <p className="text-2xl font-bold text-foreground mb-1">{milestone}-Day Streak!</p>
                  <div className="flex items-center justify-center gap-1.5 mb-3">
                    {Array.from({ length: Math.min(milestone / (milestone <= 7 ? 1 : milestone <= 30 ? 7 : 10), 5) }, (_, i) => (
                      <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.08 }} className="w-2 h-2 rounded-full bg-accent" />
                    ))}
                  </div>
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-sm text-muted-foreground leading-relaxed">{message}</motion.p>
                <motion.div initial={{ width: '100%' }} animate={{ width: 0 }} transition={{ duration: 5.5, ease: 'linear' }} className="absolute bottom-0 left-0 h-1 bg-accent/40 rounded-full" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
