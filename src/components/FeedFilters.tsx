import { cn } from '@/lib/utils';

export type FeedFilter = 'all' | 'streaks' | 'challenges' | 'leaderboards' | 'referrals' | 'friends' | 'trending';

const FILTERS: { id: FeedFilter; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '✨' },
  { id: 'trending', label: 'Trending', emoji: '🔥' },
  { id: 'streaks', label: 'Streaks', emoji: '🔥' },
  { id: 'challenges', label: 'Challenges', emoji: '🏆' },
  { id: 'leaderboards', label: 'Leaderboards', emoji: '👑' },
  { id: 'referrals', label: 'Referrals', emoji: '🎁' },
  { id: 'friends', label: 'Friends', emoji: '🤝' },
];

export default function FeedFilters({ value, onChange }: { value: FeedFilter; onChange: (v: FeedFilter) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-2 mb-2 scrollbar-hide">
      {FILTERS.map(f => (
        <button key={f.id} onClick={() => onChange(f.id)}
          className={cn(
            'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition',
            value === f.id ? 'gradient-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
          )}>
          {f.emoji} {f.label}
        </button>
      ))}
    </div>
  );
}

export function eventTypesForFilter(f: FeedFilter): string[] | null {
  switch (f) {
    case 'streaks': return ['streak_milestone'];
    case 'challenges': return ['challenge_completed'];
    case 'leaderboards': return ['rank_up'];
    case 'referrals': return ['referral_earned'];
    case 'friends': return ['partner_accepted'];
    default: return null; // all / trending
  }
}
