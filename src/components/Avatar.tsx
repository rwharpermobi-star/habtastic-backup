import { optimizeAvatarUrl } from '@/lib/avatarUrl';
import { cn } from '@/lib/utils';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size: number;
  className?: string;
  alt?: string;
  rounded?: boolean;
  quality?: number;
}

/**
 * Avatar primitive that lazy-loads, transforms Supabase Storage URLs to the
 * rendered size, sets explicit width/height (no CLS), and falls back to the
 * user's initial when no image is available.
 */
export default function Avatar({
  url, name, size, className, alt, rounded = true, quality,
}: AvatarProps) {
  const optimized = optimizeAvatarUrl(visibleAvatarUrl(url), { size, quality });
  const radius = rounded ? 'rounded-full' : 'rounded-md';
  const style = { width: size, height: size };

  if (optimized) {
    return (
      <img
        src={optimized}
        alt={alt ?? name ?? ''}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        className={cn('object-cover', radius, className)}
      />
    );
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      style={style}
      className={cn(
        'bg-secondary text-foreground flex items-center justify-center font-semibold',
        radius,
        className,
      )}
    >
      {initial}
    </div>
  );
}
