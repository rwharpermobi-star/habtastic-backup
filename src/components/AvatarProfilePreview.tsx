import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import Avatar from '@/components/Avatar';
import LevelBadge from '@/components/LevelBadge';
import StarRating from '@/components/StarRating';

interface AvatarProfilePreviewProps {
  /** Avatar image to preview. Null shows the same initial fallback the app uses. */
  url: string | null;
  name: string;
  level: number;
  isPremium: boolean;
  /** What the previewed avatar is, e.g. "Indian older female avatar 2". */
  caption?: string | null;
}

/** Real sizes the avatar is rendered at elsewhere in the app. */
const SURFACES = [
  { size: 48, label: 'Leaderboard' },
  { size: 40, label: 'Friends' },
  { size: 32, label: 'Comments' },
];

/**
 * Shows the avatar the way the user will actually see it: the profile card
 * header plus the smaller sizes used in the leaderboard, friends and comments.
 * Purely a preview — it never saves anything.
 */
export default function AvatarProfilePreview({
  url,
  name,
  level,
  isPremium,
  caption,
}: AvatarProfilePreviewProps) {
  return (
    <div className="glass rounded-card p-3">
      <motion.div
        // Re-mount on change so the swap is visible without layout thrash.
        key={url ?? 'none'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex items-center gap-3"
      >
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/40 shadow-card bg-secondary flex-shrink-0">
          <Avatar url={url} name={name} size={64} alt="Avatar preview" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-signature text-xl leading-tight truncate ${isPremium ? 'text-gradient-gold' : 'text-foreground'}`}>
              {name}
            </p>
            {isPremium ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold">
                <Crown className="w-3 h-3" /> Premium
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
                Free Plan
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <LevelBadge level={level} showStage={false} />
            <StarRating level={level} size="sm" />
          </div>
          {caption && (
            <p className="text-caption text-muted-foreground mt-1 truncate" aria-live="polite">
              {caption}
            </p>
          )}
        </div>
      </motion.div>

      <div className="mt-3 pt-3 border-t border-border/50 flex items-end gap-4">
        {SURFACES.map(surface => (
          <div key={surface.size} className="flex flex-col items-center gap-1">
            <div
              className="rounded-full overflow-hidden border border-border bg-secondary flex items-center justify-center"
              style={{ width: surface.size, height: surface.size }}
            >
              <Avatar url={url} name={name} size={surface.size} alt="" />
            </div>
            <span className="text-[10px] text-muted-foreground">{surface.label}</span>
          </div>
        ))}
        <p className="text-caption text-muted-foreground ml-auto text-right leading-tight">
          Preview only —
          <br />
          nothing saves yet.
        </p>
      </div>
    </div>
  );
}
