import { memo } from 'react';
import { getStage } from '@/lib/progression';

interface LevelBadgeProps {
  level: number;
  /** Show the stage name next to the level ("Level 23 · Consistent"). */
  showStage?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Compact level chip. Uses the stage accent colour so it stays on-brand
 * (teal → blue → purple → gold) without hardcoding utility colours.
 */
function LevelBadgeBase({ level, showStage = true, size = 'sm', className = '' }: LevelBadgeProps) {
  const stage = getStage(level);
  const pad = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${pad} ${className}`}
      style={{
        color: stage.color,
        borderColor: `${stage.color}66`,
        background: `linear-gradient(135deg, ${stage.color}24, ${stage.color}0d)`,
      }}
    >
      <span aria-hidden="true">{stage.emoji}</span>
      <span>Level {level}</span>
      {showStage && (
        <>
          <span aria-hidden="true" className="opacity-50">·</span>
          <span>{stage.name}</span>
        </>
      )}
    </span>
  );
}

export const LevelBadge = memo(LevelBadgeBase);
export default LevelBadge;
