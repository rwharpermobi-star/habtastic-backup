import { motion } from 'framer-motion';
import { getRank, getRankProgress, getXpToNextRank } from '@/lib/ranks';

interface RankBadgeProps {
  xp: number;
  variant?: 'compact' | 'full';
  showTopPercent?: boolean;
  className?: string;
}

export default function RankBadge({ xp, variant = 'compact', showTopPercent = false, className = '' }: RankBadgeProps) {
  const rank = getRank(xp);
  const progress = getRankProgress(xp);
  const xpToNext = getXpToNextRank(xp);

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${className}`}
        style={{
          background: `linear-gradient(135deg, ${rank.color}22, ${rank.color}10)`,
          borderColor: `${rank.color}55`,
          color: rank.color,
        }}
        aria-label={`Rank ${rank.tier}`}
      >
        <span className="text-sm leading-none">{rank.emoji}</span>
        <span>{rank.tier}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl p-4 border ${className}`}
      style={{
        background: `linear-gradient(135deg, ${rank.color}1f, ${rank.color}0a)`,
        borderColor: `${rank.color}55`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-lg"
          style={{ background: `linear-gradient(135deg, ${rank.color}, ${rank.color}aa)` }}
        >
          {rank.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Rank</p>
            {showTopPercent && rank.topPercent != null && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${rank.color}33`, color: rank.color }}
              >
                Top {rank.topPercent}%
              </span>
            )}
          </div>
          <p className="text-lg font-extrabold" style={{ color: rank.color }}>{rank.tier}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">XP</p>
          <p className="text-base font-bold text-foreground">{xp.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${rank.color}, ${rank.color}cc)` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
          <span>{progress}%</span>
          <span>{xpToNext != null ? `${xpToNext.toLocaleString()} XP to next rank` : 'Max rank reached 👑'}</span>
        </div>
      </div>
    </motion.div>
  );
}
