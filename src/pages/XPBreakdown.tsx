import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Zap, Trophy, Flame, Target, Calendar, TrendingUp } from 'lucide-react';
import { useHabits } from '@/hooks/useHabits';
import { useProfile } from '@/hooks/useProfile';
import { useConsistencyScore } from '@/hooks/useConsistencyScore';
import { getRank, getRankProgress, getXpToNextRank } from '@/lib/ranks';
import { formatLocalDate, todayStr } from '@/lib/habitStore';

const XP_PER_HABIT = 10; // matches default reward in useHabits / useXPReward
const XP_PERFECT_DAY_BONUS = 20;
const XP_PER_STREAK_DAY = 2;

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0; let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (completions.includes(formatLocalDate(d))) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function getWeekDates(): string[] {
  const out: string[] = [];
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  for (let i = 0; i < 7; i++) {
    const x = new Date(monday); x.setDate(monday.getDate() + i);
    out.push(formatLocalDate(x));
  }
  return out;
}

export default function XPBreakdown() {
  const navigate = useNavigate();
  const { habits } = useHabits();
  const { profile } = useProfile();
  const consistency = useConsistencyScore();

  const today = todayStr();
  const weekDates = useMemo(() => getWeekDates(), []);
  const todayIdx = weekDates.indexOf(today);

  const breakdown = useMemo(() => {
    const total = habits.length || 0;

    // Today
    const todayCompletedHabits = habits.filter(h => h.completions.includes(today));
    const todayCount = todayCompletedHabits.length;
    const todayHabitXp = todayCount * XP_PER_HABIT;
    const todayPerfect = total > 0 && todayCount === total;
    const todayPerfectXp = todayPerfect ? XP_PERFECT_DAY_BONUS : 0;
    const todayStreakXp = todayCompletedHabits.reduce((s, h) => s + Math.min(10, getStreak(h.completions)) * XP_PER_STREAK_DAY, 0);
    const todayTotalXp = todayHabitXp + todayPerfectXp + todayStreakXp;

    // Week so far (only days <= today)
    const elapsedDates = weekDates.slice(0, todayIdx + 1);
    let weekCompleted = 0;
    let weekPerfectDays = 0;
    elapsedDates.forEach(d => {
      const c = habits.filter(h => h.completions.includes(d)).length;
      weekCompleted += c;
      if (total > 0 && c === total) weekPerfectDays++;
    });
    const weekHabitXp = weekCompleted * XP_PER_HABIT;
    const weekPerfectXp = weekPerfectDays * XP_PERFECT_DAY_BONUS;
    const weekStreakXp = todayStreakXp; // streak XP today is the rolling effect

    return {
      today: {
        completed: todayCount,
        total,
        habitXp: todayHabitXp,
        perfectBonus: todayPerfectXp,
        streakXp: todayStreakXp,
        total_xp: todayTotalXp,
        perfect: todayPerfect,
      },
      week: {
        completed: weekCompleted,
        perfectDays: weekPerfectDays,
        habitXp: weekHabitXp,
        perfectXp: weekPerfectXp,
        streakXp: weekStreakXp,
        total_xp: weekHabitXp + weekPerfectXp + weekStreakXp,
        elapsed: elapsedDates.length,
      },
    };
  }, [habits, today, weekDates, todayIdx]);

  const xp = profile?.xp ?? 0;
  const rank = getRank(xp);
  const rankProgress = getRankProgress(xp);
  const xpToNext = getXpToNextRank(xp);

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-h1 text-foreground mb-1 flex items-center gap-2">
        <Zap className="w-6 h-6 text-primary" /> XP Breakdown
      </h1>
      <p className="text-sm text-muted-foreground mb-5">See exactly where every point came from.</p>

      {/* Rank summary */}
      <div className="rounded-2xl p-4 mb-5 border"
        style={{
          background: `linear-gradient(135deg, ${rank.color}1f, ${rank.color}08)`,
          borderColor: `${rank.color}55`,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="text-3xl">{rank.emoji}</div>
          <div className="flex-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Rank</p>
            <p className="text-lg font-extrabold" style={{ color: rank.color }}>{rank.tier}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Total XP</p>
            <p className="text-lg font-extrabold text-foreground">{xp.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-foreground/10 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${rankProgress}%`, background: rank.color }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-right">
          {xpToNext != null ? `${xpToNext} XP to next rank` : 'Max rank 👑'}
        </p>
      </div>

      {/* TODAY */}
      <Section icon={<Calendar className="w-4 h-4 text-primary" />} title="Today" total={breakdown.today.total_xp}>
        <Row icon="✅" label={`Habits completed (${breakdown.today.completed}/${breakdown.today.total})`}
          calc={`${breakdown.today.completed} × ${XP_PER_HABIT} XP`} value={breakdown.today.habitXp} />
        <Row icon="🏆" label="Perfect day bonus"
          calc={breakdown.today.perfect ? `+${XP_PERFECT_DAY_BONUS} XP` : 'Not yet — finish all habits'}
          value={breakdown.today.perfectBonus} />
        <Row icon="🔥" label="Streak rewards"
          calc={`Active streaks × ${XP_PER_STREAK_DAY} XP/day (capped at 10d)`}
          value={breakdown.today.streakXp} />
      </Section>

      {/* WEEK */}
      <Section icon={<TrendingUp className="w-4 h-4 text-primary" />} title={`This week (${breakdown.week.elapsed} day${breakdown.week.elapsed === 1 ? '' : 's'})`} total={breakdown.week.total_xp}>
        <Row icon="✅" label={`${breakdown.week.completed} habit completions`}
          calc={`${breakdown.week.completed} × ${XP_PER_HABIT} XP`} value={breakdown.week.habitXp} />
        <Row icon="🏆" label={`Perfect days × ${breakdown.week.perfectDays}`}
          calc={`${breakdown.week.perfectDays} × ${XP_PERFECT_DAY_BONUS} XP`} value={breakdown.week.perfectXp} />
        <Row icon="🔥" label="Streak XP earned today"
          calc="Daily streak rewards roll into weekly total"
          value={breakdown.week.streakXp} />
      </Section>

      {/* Consistency formula */}
      <div className="glass rounded-card p-4 mb-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold text-foreground">Consistency score</p>
          </div>
          <p className="text-2xl font-extrabold text-primary">{consistency.score}%</p>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
          Based on your last 7 days. Today counts double, so finishing today moves the needle most.
        </p>
        <div className="space-y-1.5 text-xs">
          <FormulaLine label="7-day completion (today × 2 weight)" value="× 100" />
          <FormulaLine label="Streak bonus" value={`+ min(10, best_streak × 0.7)`} note={`+${Math.min(10, consistency.bestStreak * 0.7).toFixed(1)}`} />
          <FormulaLine label="Miss penalty" value={`− min(10, missed_last_7 × 0.5)`} note={`−${Math.min(10, consistency.missedLast7 * 0.5).toFixed(1)}`} />
        </div>
        <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs">
          <span className="text-muted-foreground">Today {consistency.todayCompleted}/{consistency.todayTotal}</span>
          <span className="text-muted-foreground">Best streak {consistency.bestStreak}🔥</span>
          <span className="text-muted-foreground">Missed {consistency.missedLast7}</span>
        </div>
      </div>

      <p className="text-[10px] text-center text-muted-foreground">
        XP is awarded automatically when you complete habits. Bonuses apply once per day.
      </p>
    </motion.div>
  );
}

function Section({ icon, title, total, children }: { icon: React.ReactNode; title: string; total: number; children: React.ReactNode }) {
  return (
    <div className="glass rounded-card p-4 mb-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-bold text-foreground">{title}</p>
        </div>
        <p className="text-lg font-extrabold text-primary">+{total} XP</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ icon, label, calc, value }: { icon: string; label: string; calc: string; value: number }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="text-base leading-none mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{calc}</p>
      </div>
      <p className={`text-sm font-bold ${value > 0 ? 'text-primary' : 'text-muted-foreground'}`}>+{value}</p>
    </div>
  );
}

function FormulaLine({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/70 text-[10px]">{value}{note ? ` (${note})` : ''}</span>
    </div>
  );
}
