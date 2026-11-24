import { Lock, Check, Sparkles } from 'lucide-react';
import { CosmeticItem, unlockRuleLabel } from '@/hooks/useCosmetics';
import RarityBadge from './RarityBadge';
import { cn } from '@/lib/utils';

interface Props {
  item: CosmeticItem;
  owned: boolean;
  equipped?: boolean;
  onClick?: () => void;
  actionLabel?: string;
  className?: string;
}

export default function CosmeticCard({ item, owned, equipped, onClick, actionLabel, className }: Props) {
  const isLocked = !owned;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel}
      aria-pressed={owned ? !!equipped : undefined}
      className={cn(
        'relative glass rounded-card p-3 flex flex-col items-center gap-2 text-left transition-all',
        'hover:scale-[1.03] active:scale-[0.97]',
        equipped && 'ring-2 ring-primary',
        className
      )}
      style={{ borderColor: equipped ? undefined : item.preview_color.replace(')', ' / 0.3)') }}
    >
      {equipped && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center z-10">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}
      <div
        className="w-full aspect-square rounded-xl flex items-center justify-center text-4xl relative"
        style={{ background: `radial-gradient(circle, ${item.preview_color.replace(')', ' / 0.25)')}, transparent)` }}
      >
        {item.art ? (
          <img
            src={item.art}
            alt=""
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn('w-4/5 h-4/5 object-contain drop-shadow-md', isLocked && 'opacity-40 grayscale')}
          />
        ) : (
          <Sparkles className={cn('w-8 h-8 text-muted-foreground', isLocked && 'opacity-40')} />
        )}
        {isLocked && (
          <Lock className="absolute w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="w-full min-w-0">
        <p className="text-caption font-semibold text-foreground truncate">{item.name}</p>
        <div className="flex items-center justify-between gap-1 mt-1">
          <RarityBadge rarity={item.rarity} />
          {owned ? (
            <span className="text-caption text-primary font-medium">Owned</span>
          ) : (
            <span className="text-[10px] text-muted-foreground truncate">{unlockRuleLabel(item.unlock_rule)}</span>
          )}
        </div>
      </div>
    </button>
  );
}
