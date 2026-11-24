import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useConfetti } from '@/hooks/useConfetti';
import { playLevelUp } from '@/lib/sfx';
import { getStage, getStars, isMilestoneLevel, describeReward } from '@/lib/progression';
import type { GrantedLevelReward } from '@/hooks/useLevelRewards';
import StarRating from '@/components/StarRating';

interface LevelUpCelebrationProps {
  level: number;
  /** Level the user came from — enables the "19 → 20" framing. */
  previousLevel?: number;
  /** Rewards actually granted by the server for this level-up. */
  rewards?: GrantedLevelReward[];
  onClose: () => void;
}

export default function LevelUpCelebration({
  level,
  previousLevel,
  rewards = [],
  onClose,
}: LevelUpCelebrationProps) {
  const { fireConfetti } = useConfetti();
  const reduceMotion = useReducedMotion();
  const stage = getStage(level);
  const milestone = isMilestoneLevel(level);
  const stars = getStars(level);

  const rewardLines = rewards.flatMap((r) => describeReward(r));

  useEffect(() => {
    playLevelUp();
    if (milestone) {
      fireConfetti();
      const second = setTimeout(fireConfetti, 700);
      const timer = setTimeout(onClose, 6500);
      return () => { clearTimeout(second); clearTimeout(timer); };
    }
    // Ordinary levels should feel rewarding without stopping the user's flow.
    // Milestone levels (10/20/30/40/50) keep the full confetti treatment.
    const timer = setTimeout(onClose, 2600);
    return () => clearTimeout(timer);
  }, [fireConfetti, onClose, milestone]);

  const spring = { type: 'spring' as const, damping: 13, stiffness: 200 };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm px-6"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={`Level up to level ${level}`}
      >
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={reduceMotion ? { duration: 0.2 } : spring}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-sm text-center rounded-3xl px-6 py-8 ${
            milestone ? 'border-2' : 'border'
          } glass shadow-card`}
          style={{
            borderColor: milestone ? stage.color : `${stage.color}55`,
            background: milestone
              ? `linear-gradient(160deg, ${stage.color}2e, hsl(var(--card)) 60%)`
              : undefined,
            boxShadow: milestone ? `0 0 44px ${stage.color}55` : undefined,
          }}
        >
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-caption font-bold uppercase tracking-[0.3em] text-muted-foreground"
          >
            {milestone ? 'Milestone Level Up' : 'Level Up'}
          </motion.p>

          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: [0, 1.35, 1] }}
            transition={{ delay: 0.15, duration: milestone ? 0.75 : 0.5 }}
            className={milestone ? 'text-7xl my-3' : 'text-6xl my-3'}
            aria-hidden="true"
          >
            {stage.emoji}
          </motion.div>

          {previousLevel != null && previousLevel < level ? (
            <p className="text-h3 font-display font-bold text-foreground/70">
              Level {previousLevel} <span aria-hidden="true">→</span>{' '}
              <span className="text-gradient">Level {level}</span>
            </p>
          ) : (
            <p className="text-h1 font-display font-bold text-gradient">Level {level}</p>
          )}

          <p className="mt-1 text-body-lg font-display font-semibold" style={{ color: stage.color }}>
            {stage.name}
          </p>

          {stars > 0 && (
            <div className="mt-3 flex justify-center">
              <StarRating level={level} size="md" revealNewStar={milestone} />
            </div>
          )}

          {rewardLines.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: milestone ? 0.9 : 0.5 }}
              className="mt-5 rounded-2xl bg-foreground/5 px-4 py-3 text-left"
            >
              <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Rewards
              </p>
              <ul className="space-y-1">
                {rewardLines.map((line) => (
                  <li key={line} className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span aria-hidden="true">🎁</span>
                    {line}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          <p className="text-caption text-muted-foreground mt-6">Tap to continue</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
