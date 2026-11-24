import { useMemo } from 'react';
import { CosmeticItem, EquippedSlots } from '@/hooks/useCosmetics';
import Avatar from '@/components/Avatar';
import { cn } from '@/lib/utils';

interface Props {
  equipped: EquippedSlots;
  catalog: CosmeticItem[];
  size?: number;
  /** The user's own profile picture, shown as the base of the composite. */
  baseUrl?: string | null;
  fallbackName?: string;
  className?: string;
  /** Optional preview override: layer this item on top of the equipped state. */
  previewItem?: CosmeticItem | null;
}

function Layer({ item, className, style }: { item: CosmeticItem | null | undefined; className?: string; style?: React.CSSProperties }) {
  if (!item?.art) return null;
  return (
    <img
      src={item.art}
      alt=""
      aria-hidden
      draggable={false}
      decoding="async"
      className={cn('absolute pointer-events-none select-none object-contain', className)}
      style={style}
    />
  );
}

/**
 * Composites the user's avatar with equipped cosmetic artwork.
 * Order back-to-front: background, avatar, clothing, face, hair, frame, hat, accessory, effect.
 */
export default function AvatarCanvas({
  equipped, catalog, size = 120, baseUrl, fallbackName, className, previewItem,
}: Props) {
  const byId = useMemo(() => {
    const m = new Map<string, CosmeticItem>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  const slots: EquippedSlots = useMemo(() => {
    if (!previewItem) return equipped;
    return { ...equipped, [previewItem.category]: previewItem.id };
  }, [equipped, previewItem]);

  const get = (id: string | null) => (id ? byId.get(id) : undefined);
  const bg = get(slots.background);
  const frame = get(slots.frame);
  const cloth = get(slots.clothing);
  const face = get(slots.face);
  const hair = get(slots.hairstyle);
  const hat = get(slots.hat);
  const acc = get(slots.accessory);
  const fx = get(slots.effect);

  // Leave room for the frame ring around the avatar.
  const inner = Math.round(size * (frame?.art ? 0.74 : 0.9));

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      aria-label={fallbackName || 'Avatar'}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: bg
            ? `radial-gradient(circle at 30% 30%, ${bg.preview_color}, hsl(var(--background)))`
            : `radial-gradient(circle at 30% 30%, ${(frame ?? fx ?? hat)?.preview_color.replace(')', ' / 0.35)') ?? 'hsl(var(--muted))'}, transparent 72%)`,
        }}
      />
      <div
        className="absolute rounded-full overflow-hidden"
        style={{ width: inner, height: inner, left: (size - inner) / 2, top: (size - inner) / 2 }}
      >
        <Avatar url={baseUrl} name={fallbackName} size={inner} className="w-full h-full" />
        <Layer item={cloth} className="inset-x-0 bottom-0 w-full h-1/2" />
        <Layer item={face} className="inset-0 w-full h-full" />
        <Layer item={hair} className="inset-x-0 top-0 w-full h-1/2" />
      </div>
      <Layer item={frame} className="inset-0 w-full h-full" style={{ zIndex: 2 }} />
      <Layer
        item={hat}
        style={{ width: size * 0.46, height: size * 0.46, left: size * 0.27, top: -size * 0.2, zIndex: 3, transform: 'rotate(-8deg)' }}
      />
      <Layer
        item={acc}
        style={{ width: size * 0.3, height: size * 0.3, left: size * 0.05, bottom: size * 0.05, zIndex: 4 }}
      />
      <Layer
        item={fx}
        className="animate-pulse"
        style={{ width: size * 0.34, height: size * 0.34, right: -size * 0.02, bottom: -size * 0.02, zIndex: 5 }}
      />
    </div>
  );
}
