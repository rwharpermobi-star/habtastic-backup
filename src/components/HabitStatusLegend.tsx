import { STATUS_COLORS } from '@/lib/habitStatus';
import PartialFillCircle from './PartialFillCircle';

type Item =
  | { kind: 'solid'; color: string; label: string }
  | { kind: 'outline'; color: string; label: string }
  | { kind: 'partial'; color: string; label: string };

const items: Item[] = [
  { kind: 'solid', color: STATUS_COLORS.completed, label: 'Completed' },
  { kind: 'partial', color: STATUS_COLORS.partial, label: 'Partial' },
  { kind: 'solid', color: STATUS_COLORS.missed, label: 'Missed' },
  { kind: 'outline', color: STATUS_COLORS.today, label: 'Today' },
];

export default function HabitStatusLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 ${className}`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.kind === 'partial' ? (
            <PartialFillCircle size={12} ariaLabel={item.label} />
          ) : (
            <span
              className="w-2.5 h-2.5 rounded-full border-2"
              style={{
                backgroundColor: item.kind === 'solid' ? item.color : 'transparent',
                borderColor: item.color,
                // Subtle outer ring keeps the swatch visible against any bg
                // (dark-mode #0B1220 vs light #F0FBF7) without altering brand colors.
                boxShadow: `0 0 0 1px hsl(var(--border) / 0.4)`,
              }}
            />
          )}
          <span className="text-[10px] text-foreground/80 font-medium">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
