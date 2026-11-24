import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { SurpriseReward } from '@/hooks/useSurpriseReward';
import { useEffect } from 'react';

const RARITY_STYLES = {
  common: 'from-primary/90 to-primary',
  rare: 'from-[hsl(217,91%,60%)] to-[hsl(230,94%,65%)]',
  epic: 'from-[hsl(271,81%,56%)] to-[hsl(280,87%,65%)]',
  legendary: 'from-[hsl(45,93%,47%)] to-[hsl(36,100%,50%)]',
};

const RARITY_LABELS = {
  common: 'Common Drop',
  rare: 'Rare Drop',
  epic: 'Epic Drop',
  legendary: 'Legendary Drop',
};

interface SurpriseRewardPopupProps {
  reward: SurpriseReward;
  onClose: () => void;
}

export default function SurpriseRewardPopup({ reward, onClose }: SurpriseRewardPopupProps) {
  useEffect(() => {
    const duration = reward.rarity === 'legendary' || reward.rarity === 'epic' ? 3200 : 2400;
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [reward.rarity, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-x-0 top-4 z-[100] flex justify-center px-4 pointer-events-none"
        initial={{ opacity: 0, y: -18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      >
        <motion.div
          role="status"
          aria-live="polite"
          className={`pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden shadow-xl border border-white/15 bg-gradient-to-r ${RARITY_STYLES[reward.rarity]}`}
          onClick={onClose}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-3xl shrink-0" aria-hidden="true">{reward.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
                {RARITY_LABELS[reward.rarity]}
              </p>
              <p className="text-lg font-extrabold font-display text-white leading-tight">
                {reward.label}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={(event) => { event.stopPropagation(); onClose(); }}
              className="h-8 px-2 text-white/80 hover:text-white hover:bg-white/10 shrink-0"
            >
              OK
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
