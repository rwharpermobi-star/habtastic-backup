import { useEffect, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { CosmeticItem } from '@/hooks/useCosmetics';

interface Props { items: CosmeticItem[]; }

function fmt(msLeft: number): string {
  if (msLeft <= 0) return 'ended';
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function LimitedDropBanner({ items }: Props) {
  // Find the soonest-ending active limited item
  const limited = items
    .filter((i) => i.available_until && new Date(i.available_until).getTime() > Date.now())
    .sort((a, b) => new Date(a.available_until!).getTime() - new Date(b.available_until!).getTime())[0];

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!limited) return;
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, [limited]);

  if (!limited) return null;
  const msLeft = new Date(limited.available_until!).getTime() - Date.now();

  return (
    <div
      className="glass rounded-card p-4 flex items-center gap-3 shadow-card relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${limited.preview_color.replace(')', ' / 0.18)')}, hsl(var(--card)))`,
        borderColor: limited.preview_color,
      }}
      key={tick}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
        style={{ background: limited.preview_color.replace(')', ' / 0.2)') }}>
        {limited.art ? (
          <img src={limited.art} alt="" width={40} height={40} className="w-10 h-10 object-contain" />
        ) : (
          <Sparkles className="w-5 h-5" style={{ color: limited.preview_color }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider" style={{ color: limited.preview_color }}>
          <Sparkles className="w-3 h-3" /> Limited Drop
        </div>
        <p className="text-body font-semibold text-foreground truncate">{limited.name}</p>
        <div className="flex items-center gap-1 text-caption text-muted-foreground">
          <Clock className="w-3 h-3" /> ends in {fmt(msLeft)}
        </div>
      </div>
    </div>
  );
}
