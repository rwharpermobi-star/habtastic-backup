import { PiggyBank, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMoneySaver } from '@/hooks/useMoneySaver';
import { calculateSavingsMetrics, formatMoney } from '../../supabase/functions/_shared/savingsCalculations';

const paceLabel = {
  ahead: 'Ahead of target',
  on_track: 'On track',
  slightly_behind: 'Slightly behind',
  significantly_behind: 'Behind target',
} as const;

export default function MoneySaverProgressSummary() {
  const navigate = useNavigate();
  const { activeGoals, completedGoals, loading } = useMoneySaver();
  const goal = activeGoals[0] ?? completedGoals[0];
  if (loading || !goal) return null;

  const metrics = calculateSavingsMetrics(goal);
  return (
    <button
      type="button"
      onClick={() => navigate('/money-saver')}
      className="w-full glass rounded-card p-4 shadow-card mb-5 text-left hover:bg-secondary/20 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/12 text-primary flex items-center justify-center shrink-0">
          <PiggyBank className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Money Saver</p>
              <p className="font-semibold text-foreground truncate">{goal.name}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
          <div className="flex justify-between gap-3 mt-2 text-xs">
            <span className="text-muted-foreground">{formatMoney(goal.current_amount, goal.currency)} / {formatMoney(goal.target_amount, goal.currency)}</span>
            <span className="font-semibold text-primary">{Math.round(metrics.progressPercent)}% · {paceLabel[metrics.paceStatus]}</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden">
            <div className="h-full rounded-full gradient-primary" style={{ width: `${metrics.progressPercent}%` }} />
          </div>
        </div>
      </div>
    </button>
  );
}
