import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';

interface Props {
  /** Compact = small chip for Home; full = bigger card variant for Coach. */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Surfaces the *Challenge Streak* — separate from per-habit streaks. It only
 * counts consecutive days where Winston's daily challenge was completed.
 * Hidden until the user has ever completed at least one challenge so we don't
 * show "0" noise to brand-new users.
 */
export default function ChallengeStreakBadge({ variant = 'compact', className = '' }: Props) {
  const { streak, hydrated } = useDailyChallenge();

  if (!hydrated) return null;
  // Don't surface a 0 with no history — keeps the UI clean for new users
  if (streak.count === 0 && streak.best === 0) return null;

  const isHot = streak.count >= 3;
  const label = streak.count > 0
    ? `${streak.count}-Day Challenge Streak`
    : `Best: ${streak.best} days`;

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${
          isHot
            ? 'bg-accent/15 border-accent/35 text-accent'
            : 'bg-secondary/60 border-border/30 text-foreground/85'
        } ${className}`}
      >
        <Flame className={`w-3 h-3 ${isHot ? 'animate-pulse' : ''}`} />
        <span>{label}</span>
      </motion.div>
    );
  }

  // Full variant — centerpiece for the Coach page
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl px-4 py-3 flex items-center gap-3 border backdrop-blur-sm ${
        isHot
          ? 'bg-gradient-to-br from-accent/15 via-accent/8 to-transparent border-accent/30'
          : 'bg-secondary/40 border-border/25'
      } ${className}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        isHot ? 'bg-accent/20' : 'bg-secondary/80'
      }`}>
        <Flame className={`w-5 h-5 ${isHot ? 'text-accent' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Challenge Streak
        </p>
        <p className="font-bold text-body text-foreground leading-tight">
          {streak.count > 0 ? `${streak.count} day${streak.count === 1 ? '' : 's'} in a row 🔥` : 'Streak broken'}
        </p>
        {streak.best > streak.count && (
          <p className="text-[10.5px] text-muted-foreground mt-0.5">
            Personal best: {streak.best} days
          </p>
        )}
      </div>
    </motion.div>
  );
}
