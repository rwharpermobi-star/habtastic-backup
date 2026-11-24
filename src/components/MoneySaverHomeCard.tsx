import { motion } from 'framer-motion';
import { PiggyBank, ChevronRight, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMoneySaver } from '@/hooks/useMoneySaver';
import { calculateSavingsMetrics, formatMoney } from '../../supabase/functions/_shared/savingsCalculations';

export default function MoneySaverHomeCard() {
  const navigate = useNavigate();
  const { activeGoals, completedGoals, loading } = useMoneySaver();
  const goal = activeGoals[0] ?? completedGoals[0];

  if (loading) {
    return <div className="glass rounded-card p-5 shadow-card h-32 animate-pulse" aria-label="Loading Money Saver" />;
  }

  if (!goal) {
    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.985 }}
        onClick={() => navigate('/money-saver')}
        className="w-full glass rounded-card p-5 shadow-card text-left border border-primary/15"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/12 text-primary flex items-center justify-center shrink-0">
            <PiggyBank className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-foreground">💰 Money Saver</h3>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">Turn small savings into big wins.</p>
            <span className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-primary">
              <Plus className="w-4 h-4" /> Create my first savings goal
            </span>
          </div>
        </div>
      </motion.button>
    );
  }

  const metrics = calculateSavingsMetrics(goal);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      onClick={() => navigate('/money-saver')}
      className="w-full glass rounded-card p-5 shadow-card text-left border border-primary/15"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/12 text-primary flex items-center justify-center shrink-0">
          <PiggyBank className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">💰 Money Saver</p>
              <h3 className="font-display font-bold text-foreground truncate">{goal.name}</h3>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
          <div className="flex items-end justify-between gap-3 mt-3">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-bold">{formatMoney(goal.current_amount, goal.currency)}</span>
              {' '}of {formatMoney(goal.target_amount, goal.currency)}
            </p>
            <span className="text-sm font-bold text-primary">{Math.round(metrics.progressPercent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary mt-2 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${metrics.progressPercent}%` }}
              transition={{ duration: 0.55 }}
              className="h-full rounded-full gradient-primary"
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-primary">Open Money Saver</p>
        </div>
      </div>
    </motion.button>
  );
}
