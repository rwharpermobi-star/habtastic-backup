import { useNavigate } from 'react-router-dom';
import { Trophy, ChevronRight } from 'lucide-react';
import { useMyWeeklyRank } from '@/hooks/useWeeklyRank';

/**
 * Compact Home-page entry point into the Leaderboard, showing the signed-in
 * user's current weekly rank. Rendered as a real <button> so keyboard
 * activation (Enter/Space) and focus rings come from the platform.
 */
export function LeaderboardRankCard() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyWeeklyRank();

  const rank = data?.rank ?? null;
  const total = data?.total ?? 0;

  const rankLabel = isLoading
    ? 'Loading your rank…'
    : rank
      ? `You're #${rank}${total > 0 ? ` of ${total}` : ''} this week`
      : 'See how you compare this week';

  const ariaLabel = isLoading
    ? 'Leaderboard and rankings. Loading your weekly rank.'
    : rank
      ? `Leaderboard and rankings. You are ranked number ${rank}${total > 0 ? ` of ${total}` : ''} this week. Open leaderboard.`
      : 'Leaderboard and rankings. See how you compare this week. Open leaderboard.';

  return (
    <button
      type="button"
      onClick={() => navigate('/leaderboard')}
      aria-label={ariaLabel}
      className="w-full min-h-11 glass p-4 rounded-card shadow-card text-left active:scale-[0.98] transition-transform border border-primary/20 relative overflow-hidden group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 opacity-60" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_90%_50%,hsl(var(--accent)/0.25),transparent_60%)]" />
      <div className="relative flex items-center gap-4">
        <div
          aria-hidden="true"
          className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0 shadow-[0_0_16px_hsl(var(--primary)/0.35)]"
        >
          <Trophy className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-body text-foreground flex items-center gap-1.5">
            <span aria-hidden="true">🏆</span> Leaderboard &amp; Rankings
          </p>
          {isLoading ? (
            <span
              data-testid="rank-skeleton"
              className="mt-1 block h-3 w-32 rounded bg-muted animate-pulse"
            />
          ) : (
            <p className="text-caption text-muted-foreground mt-0.5 line-clamp-1">
              {rankLabel}
            </p>
          )}
        </div>
        <ChevronRight
          aria-hidden="true"
          className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
        />
      </div>
    </button>
  );
}

export default LeaderboardRankCard;
