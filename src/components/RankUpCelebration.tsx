import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRank, type RankTier } from '@/lib/ranks';
import { vibrateSuccess } from '@/lib/haptics';

interface Props {
  tier: RankTier | null;
  onClose: () => void;
}

export default function RankUpCelebration({ tier, onClose }: Props) {
  useEffect(() => {
    if (!tier) return;
    vibrateSuccess();
    const t = setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [tier, onClose]);

  if (!tier) return null;
  const rank = getRank(tier === 'Bronze' ? 0 : (
    { Silver: 250, Gold: 750, Platinum: 1750, Diamond: 3500, Elite: 6500 } as Record<RankTier, number>
  )[tier]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="relative rounded-3xl p-8 text-center max-w-sm w-full border-2 shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${rank.color}33, ${rank.color}10)`,
            borderColor: rank.color,
          }}
        >
          <motion.div
            animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1 }}
            className="text-7xl mb-4"
          >
            {rank.emoji}
          </motion.div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground mb-1">Rank Up</p>
          <h2 className="text-3xl font-extrabold mb-2" style={{ color: rank.color }}>
            You reached {rank.tier.toUpperCase()}
          </h2>
          {rank.topPercent != null && (
            <p className="text-sm text-foreground/80 mb-4">
              You're in the top <span className="font-bold" style={{ color: rank.color }}>{rank.topPercent}%</span> of users 🚀
            </p>
          )}
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2.5 rounded-full font-bold text-sm"
            style={{ background: rank.color, color: 'hsl(var(--background))' }}
          >
            Keep going
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
