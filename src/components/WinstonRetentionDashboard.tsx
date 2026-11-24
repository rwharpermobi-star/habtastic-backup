import { motion } from 'framer-motion';
import { Sparkles, RefreshCw, Loader2, TrendingUp, AlertTriangle, Trophy, CheckCircle2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDailyCoaching } from '@/hooks/useDailyCoaching';
import { useAIChallenges } from '@/hooks/useAIChallenges';
import { useHabits } from '@/hooks/useHabits';
import { todayStr } from '@/lib/habitStore';

function scoreColor(score: number) {
  if (score >= 75) return 'text-primary';
  if (score >= 50) return 'text-accent';
  if (score >= 25) return 'text-orange-500';
  return 'text-destructive';
}

function EngagementRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <svg width={64} height={64} className="-rotate-90">
      <circle cx={32} cy={32} r={r} stroke="hsl(var(--secondary))" strokeWidth={6} fill="none" />
      <circle
        cx={32} cy={32} r={r} strokeWidth={6} fill="none" strokeLinecap="round"
        className={scoreColor(score)}
        stroke="currentColor"
        strokeDasharray={`${dash} ${c}`}
      />
    </svg>
  );
}

export default function WinstonRetentionDashboard() {
  const { coaching, loading, generating, generate } = useDailyCoaching();
  const { active, busy, accept, complete } = useAIChallenges();
  const { habits, toggleCompletion } = useHabits();
  const navigate = useNavigate();

  if (loading && !coaching) {
    return (
      <div className="glass rounded-card p-4 flex items-center gap-3 shadow-card">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-caption text-muted-foreground">Winston is preparing your day…</span>
      </div>
    );
  }

  if (!coaching) {
    return (
      <button
        type="button"
        onClick={() => generate(true)}
        disabled={generating}
        className="w-full glass rounded-card p-4 text-left shadow-card flex items-center gap-3 disabled:opacity-60"
      >
        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          {generating ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <Sparkles className="w-5 h-5 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body font-semibold text-foreground">Get today's Winston coaching</p>
          <p className="text-caption text-muted-foreground">Personalized engagement score, message, and next steps.</p>
        </div>
      </button>
    );
  }

  // Compute active-challenge progress (target habit's completions within window)
  let challengeProgress = 0;
  if (active) {
    const habit = active.target_habit_id ? habits.find(h => h.id === active.target_habit_id) : null;
    const start = active.start_date;
    const end = active.end_date;
    if (habit) {
      challengeProgress = habit.completions.filter(d => d >= start && d <= end).length;
    } else {
      // Any-habit-per-day mode
      const set = new Set<string>();
      for (const h of habits) for (const d of h.completions) if (d >= start && d <= end) set.add(d);
      challengeProgress = set.size;
    }
  }
  const canComplete = !!active && challengeProgress >= (active?.duration_days ?? 0);
  const targetHabit = active?.target_habit_id ? habits.find(h => h.id === active.target_habit_id) : null;
  const targetDoneToday = targetHabit?.completions.includes(todayStr());

  return (
    <div className="space-y-3">
      {/* Engagement + Winston message */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-card p-4 shadow-card border border-primary/15 relative overflow-hidden"
      >
        <div className="absolute top-3 right-3 flex items-center gap-1 text-caption text-primary font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          Today with Winston
        </div>
        <div className="flex items-start gap-3 mt-5">
          <div className="relative shrink-0">
            <EngagementRing score={coaching.engagement_score} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-body font-bold ${scoreColor(coaching.engagement_score)}`}>
                {coaching.engagement_score}
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-caption text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Engagement · {coaching.completion_rate_7d}% last 7d · 🔥 {coaching.best_streak}d
            </p>
            <p className="text-body font-semibold text-foreground leading-snug mt-1">
              {coaching.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={generating}
            className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center shrink-0 disabled:opacity-50"
            aria-label="Refresh Winston coaching"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>

        {coaching.recommendations?.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {coaching.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-caption text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span className="leading-snug">{rec}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* At-risk habits */}
      {coaching.at_risk_habits?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-card p-4 shadow-card bg-warning/10 border border-warning/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <p className="text-body font-semibold text-foreground">Habits at risk</p>
          </div>
          <p className="text-caption text-muted-foreground mb-3">
            These habits dropped below 50% this week. Pick one to revive today.
          </p>
          <div className="space-y-2">
            {coaching.at_risk_habits.slice(0, 3).map(h => {
              const habit = habits.find(x => x.id === h.id);
              const doneToday = habit?.completions.includes(todayStr());
              return (
                <div key={h.id} className="flex items-center gap-2 p-2 rounded-btn bg-card/60">
                  <span className="text-lg shrink-0">{h.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-semibold text-foreground truncate">{h.name}</p>
                    <p className="text-[11px] text-muted-foreground">{h.rate}% over {h.days_active}d</p>
                  </div>
                  {habit && (
                    <button
                      type="button"
                      onClick={() => toggleCompletion(h.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                        doneToday
                          ? 'bg-primary/15 text-primary'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {doneToday ? 'Done' : 'Do today'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Active or suggested AI challenge */}
      {active ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-card p-4 shadow-card glass border border-accent/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-accent" />
            <p className="text-body font-semibold text-foreground">{active.title}</p>
          </div>
          <p className="text-caption text-muted-foreground mb-3">{active.description}</p>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-2 bg-secondary/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${Math.min(100, (challengeProgress / active.duration_days) * 100)}%` }}
              />
            </div>
            <span className="text-caption font-semibold text-foreground">{challengeProgress}/{active.duration_days}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Reward: +{active.reward_xp} XP</span>
            {canComplete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => complete(active.id)}
                className="px-3 py-1.5 rounded-full bg-accent text-accent-foreground text-caption font-semibold disabled:opacity-50"
              >
                Claim reward
              </button>
            ) : targetHabit && !targetDoneToday ? (
              <button
                type="button"
                onClick={() => toggleCompletion(targetHabit.id)}
                className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-caption font-semibold"
              >
                Mark {targetHabit.emoji} done
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">Keep going</span>
            )}
          </div>
        </motion.div>
      ) : coaching.suggested_challenge ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-card p-4 shadow-card glass border border-primary/15"
        >
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-primary" />
            <p className="text-body font-semibold text-foreground">{coaching.suggested_challenge.title}</p>
          </div>
          <p className="text-caption text-muted-foreground mb-3">{coaching.suggested_challenge.description}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => accept()}
            className="w-full py-2.5 rounded-btn gradient-primary text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Accept {coaching.suggested_challenge.duration_days}-day challenge
          </button>
        </motion.div>
      ) : null}

      {/* Link to full weekly review */}
      <button
        type="button"
        onClick={() => navigate('/weekly-review')}
        className="w-full glass rounded-card p-3 shadow-card flex items-center justify-between"
      >
        <span className="text-caption font-semibold text-foreground">See full weekly AI review</span>
        <ChevronRight className="w-4 h-4 text-primary" />
      </button>
    </div>
  );
}
