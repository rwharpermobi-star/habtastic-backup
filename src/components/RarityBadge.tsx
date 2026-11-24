import { CosmeticRarity, rarityColor, rarityLabel } from '@/hooks/useCosmetics';
import { cn } from '@/lib/utils';

interface Props { rarity: CosmeticRarity; className?: string; }

export default function RarityBadge({ rarity, className }: Props) {
  const color = rarityColor(rarity);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md',
        className
      )}
      style={{
        backgroundColor: `${color.replace('hsl(', 'hsl(').replace(')', ' / 0.18)')}`,
        color,
        border: `1px solid ${color}`,
      }}
    >
      {rarityLabel(rarity)}
    </span>
  );
}
