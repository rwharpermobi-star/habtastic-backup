import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PremiumBadgeProps {
  size?: 'xs' | 'sm' | 'md';
  variant?: 'solid' | 'subtle' | 'outline';
  label?: string;
  className?: string;
}

/**
 * Small reusable "Premium" badge used to mark premium-only features
 * across the app. Pair with `UpsellTooltip` for the contextual hint.
 */
export default function PremiumBadge({
  size = 'sm',
  variant = 'subtle',
  label = 'Premium',
  className,
}: PremiumBadgeProps) {
  const sizes = {
    xs: 'text-[9px] px-1.5 py-0.5 gap-0.5',
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1',
  } as const;

  const iconSize = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  } as const;

  const variants = {
    solid: 'bg-primary text-primary-foreground shadow-sm',
    subtle: 'bg-primary/15 text-primary',
    outline: 'border border-primary/40 text-primary bg-transparent',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-bold uppercase tracking-wide whitespace-nowrap',
        sizes[size],
        variants[variant],
        className,
      )}
    >
      <Crown className={cn(iconSize[size], 'shrink-0')} />
      {label}
    </span>
  );
}
