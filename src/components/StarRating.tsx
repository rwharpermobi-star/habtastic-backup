import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { getStars } from '@/lib/progression';

interface StarRatingProps {
  /** Current level — stars are derived (10/20/30/40/50). */
  level: number;
  size?: 'xs' | 'sm' | 'md';
  /** Animate the most recently earned star appearing. */
  revealNewStar?: boolean;
  /** Render remaining stars as dim outlines (progression preview only). */
  showEmpty?: boolean;
  className?: string;
}

const SIZES: Record<NonNullable<StarRatingProps['size']>, string> = {
  xs: 'text-[10px]',
  sm: 'text-xs',
  md: 'text-base',
};

/**
 * Compact star row for Home, Profile, Leaderboard and Community surfaces.
 * Transform/opacity-only animations keep it smooth on Android.
 */
function StarRatingBase({
  level,
  size = 'sm',
  revealNewStar = false,
  showEmpty = false,
  className = '',
}: StarRatingProps) {
  const reduceMotion = useReducedMotion();
  const stars = getStars(level);
  if (stars === 0 && !showEmpty) return null;

  const total = showEmpty ? 5 : stars;

  return (
    <div
      className={`inline-flex items-center gap-0.5 leading-none ${SIZES[size]} ${className}`}
      aria-label={`${stars} of 5 progression stars`}
      role="img"
    >
      {Array.from({ length: total }, (_, i) => {
        const earned = i < stars;
        const isNewest = revealNewStar && earned && i === stars - 1;
        return (
          <motion.span
            key={i}
            aria-hidden="true"
            initial={isNewest && !reduceMotion ? { scale: 0, opacity: 0 } : false}
            animate={isNewest && !reduceMotion ? { scale: [0, 1.5, 1], opacity: 1 } : undefined}
            transition={{ duration: 0.55, delay: 0.35, ease: 'easeOut' }}
            className={earned ? 'drop-shadow-[0_0_4px_rgba(255,199,0,0.55)]' : 'opacity-25'}
            style={{ willChange: isNewest ? 'transform' : undefined }}
          >
            {earned ? '⭐' : '☆'}
          </motion.span>
        );
      })}
    </div>
  );
}

export const StarRating = memo(StarRatingBase);
export default StarRating;
