import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import LevelBadge from '@/components/LevelBadge';
import StarRating from '@/components/StarRating';
import { getLevelFromXP, getNextReward, getNextStar, MAX_LEVEL } from '@/lib/progression';

const STAR_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/**
 * Primary long-term progression block: Level → XP → next reward → next star.
 * Rendered at the top of the Progress page so XP/Level reads as THE journey,
 * with Growth Score / Coins / Streaks / Rank clearly labelled as separate ideas.
 */
export default function ProgressionCard({ xp }: { xp: number }) {
  const { level, progress, xpCurrent, xpNeeded } = getLevelFromXP(xp);
  const nextReward = getNextReward(level);
  const nextStar = getNextStar(level);
  const atMax = level >= MAX_LEVEL;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="glass rounded-card p-4 mb-5 shadow-card border border-primary/20"
      aria-label="Level progression"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
          Your progression
        </p>
        <StarRating level={level} size="sm" />
      </div>

      <div className="flex items-center justify-between gap-3 mt-2">
        <LevelBadge level={level} size="md" />
        <p className="text-sm font-bold text-foreground shrink-0">
          {atMax ? `${xp.toLocaleString()} XP` : `${xpCurrent} / ${xpNeeded} XP`}
        </p>
      </div>

      <div className="mt-2.5 h-2.5 rounded-full bg-foreground/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full gradient-primary"
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      </div>

      <div className="mt-3 space-y-1.5">
        {nextReward && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span aria-hidden="true">🎁</span>
            <span className="text-foreground/80 font-semibold">Next reward:</span>{' '}
            {nextReward.label} — Level {nextReward.level}
          </p>
        )}
        {nextStar ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span aria-hidden="true">⭐</span>
            <span className="text-foreground/80 font-semibold">Next star:</span>{' '}
            {STAR_ORDINALS[nextStar.star - 1]} Star — Level {nextStar.level}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span aria-hidden="true">👑</span> All 5 stars earned — Master of HabTastic AI
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/80 flex items-center gap-1 pt-0.5">
          <Zap className="w-3 h-3" /> Complete habits to earn XP, level up and unlock rewards
        </p>
      </div>
    </motion.section>
  );
}
