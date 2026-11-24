import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  place: 1 | 2 | 3;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  tooltip?: string;
}

const COLORS: Record<1 | 2 | 3, string> = {
  1: 'text-yellow-400 drop-shadow-[0_0_6px_rgba(250,200,0,0.6)]',
  2: 'text-slate-300 drop-shadow-[0_0_4px_rgba(200,200,200,0.6)]',
  3: 'text-amber-600 drop-shadow-[0_0_4px_rgba(180,90,30,0.6)]',
};

const SIZES = { sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-6 h-6' };

export default function CrownBadge({ place, size = 'md', className, tooltip }: Props) {
  return (
    <span title={tooltip || `Monthly Top ${place}`} className={cn('inline-flex items-center', className)}>
      <Crown className={cn(SIZES[size], COLORS[place])} strokeWidth={2.2} fill="currentColor" />
    </span>
  );
}
