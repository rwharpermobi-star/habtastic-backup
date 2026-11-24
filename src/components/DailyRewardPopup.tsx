import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Flame, X } from 'lucide-react';
import { useConfetti } from '@/hooks/useConfetti';

interface DailyRewardPopupProps {
  xpEarned: number;
  reason: string;
  onClose: () => void;
}

export default function DailyRewardPopup({ xpEarned, reason, onClose }: DailyRewardPopupProps) {
  const { fireConfetti } = useConfetti();
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (xpEarned >= 25) fireConfetti();
    const timer = setTimeout(() => { setShow(false); setTimeout(onClose, 300); }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-24 left-4 right-4 z-50 max-w-sm mx-auto"
        >
          <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-card/95 backdrop-blur-xl shadow-2xl p-5">
            {/* Glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-accent/20 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 rounded-full bg-primary/15 blur-2xl" />

            <button onClick={() => { setShow(false); setTimeout(onClose, 300); }} className="absolute top-3 right-3 text-muted-foreground p-1">
              <X className="w-4 h-4" />
            </button>

            <div className="relative flex items-center gap-4">
              <motion.div
                initial={{ rotate: -20, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', delay: 0.1 }}
                className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center"
              >
                <Zap className="w-7 h-7 text-accent" />
              </motion.div>
              <div className="flex-1">
                <motion.p
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-xl font-bold text-foreground"
                >
                  +{xpEarned} XP
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-sm text-muted-foreground"
                >
                  {reason}
                </motion.p>
              </div>
            </div>

            {/* Progress shimmer */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 3.5, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-1 bg-accent/50 rounded-full"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
