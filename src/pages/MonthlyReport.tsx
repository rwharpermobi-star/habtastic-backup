import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, TrendingUp, Flame, Target, Award, Calendar, X, Check, Minus } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useHabits } from '@/hooks/useHabits';
import PremiumGate from '@/components/PremiumGate';
import { FEATURES } from '@/lib/featureGating';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

interface DayPoint { day: number; date: string; completed: number; total: number; rate: number }
interface StreakPoint { day: number; date: string; streak: number }

function useMonthlyReport(habits: ReturnType<typeof useHabits>['habits'], month: Date) {
  return useMemo(() => {
    const year = month.getFullYear();
    const monthIdx = month.getMonth();
    const totalDays = daysInMonth(year, monthIdx);
    const today = new Date();
    const todayISO = fmtISO(today);
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIdx;

    // Per-day completion + rolling streak (all habits combined)
    const dayPoints: DayPoint[] = [];
    const streakPoints: StreakPoint[] = [];
    let rollingStreak = 0;

    for (let d = 1; d <= totalDays; d++) {
      const iso = fmtISO(new Date(year, monthIdx, d));
      const isFuture = iso > todayISO;
      const dueHabits = habits.filter((h) => {
        if (h.frequency === 'custom') {
          return (h.custom_days || []).includes(new Date(year, monthIdx, d).getDay());
        }
        return true;
      });
      const completed = dueHabits.filter((h) => h.completions.includes(iso)).length;
      const total = dueHabits.length;
      const rate = total > 0 && !isFuture ? Math.round((completed / total) * 100) : 0;
      dayPoints.push({ day: d, date: iso, completed, total, rate });

      // Streak logic: any completion that day counts as an active day
      if (!isFuture) {
        if (completed > 0) rollingStreak += 1;
        else rollingStreak = 0;
      }
      streakPoints.push({ day: d, date: iso, streak: isFuture ? 0 : rollingStreak });
    }

    const elapsedDays = isCurrentMonth ? today.getDate() : totalDays;
    const validPoints = dayPoints.slice(0, elapsedDays);
    const totalCompletions = validPoints.reduce((s, p) => s + p.completed, 0);
    const bestDay = validPoints.reduce<DayPoint | null>((best, p) => {
      if (!best || p.completed > best.completed) return p;
      return best;
    }, null);
    const avgPerDay = elapsedDays > 0 ? +(totalCompletions / elapsedDays).toFixed(1) : 0;
    const avgRate = elapsedDays > 0
      ? Math.round(validPoints.reduce((s, p) => s + p.rate, 0) / elapsedDays)
      : 0;

    // Per-habit completion % for the month
    const perHabit = habits.map((h) => {
      const completed = validPoints.filter((p) => h.completions.includes(p.date)).length;
      const pct = elapsedDays > 0 ? Math.round((completed / elapsedDays) * 100) : 0;
      return { id: h.id, name: h.name, emoji: h.emoji, completed, pct };
    }).sort((a, b) => b.pct - a.pct);

    return {
      dayPoints,
      streakPoints,
      totalCompletions,
      bestDay,
      avgPerDay,
      avgRate,
      perHabit,
      elapsedDays,
      totalDays,
      isCurrentMonth,
    };
  }, [habits, month]);
}

function StatTile({ icon: Icon, label, value, tone = 'primary' }: { icon; label: string; value: string | number; tone?: 'primary' | 'accent' }) {
  const color = tone === 'primary' ? 'text-primary' : 'text-accent';
  return (
    <div className="glass rounded-card p-4 shadow-card">
      <Icon className={`w-5 h-5 ${color} mb-2`} strokeWidth={1.5} />
      <p className="font-bold text-body-lg text-foreground">{value}</p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}

export default function MonthlyReport() {
  return (
    <PremiumGate
      feature={FEATURES.ADVANCED_ANALYTICS}
      fallbackTitle="Monthly Progress"
      fallbackDescription="Your analytics history is saved. Activate Premium to unlock your reports again without losing any progress."
    >
      <MonthlyReportContent />
    </PremiumGate>
  );
}

function MonthlyReportContent() {
  const navigate = useNavigate();
  const { habits, loading } = useHabits();
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const report = useMonthlyReport(habits, month);

  const dayDetail = useMemo(() => {
    if (!selectedDay) return null;
    const point = report.dayPoints.find((p) => p.date === selectedDay);
    if (!point) return null;
    const dow = new Date(point.date + 'T00:00:00').getDay();
    const due = habits.filter((h) => h.frequency === 'custom' ? (h.custom_days || []).includes(dow) : true);
    return {
      point,
      items: due.map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, done: h.completions.includes(point.date) })),
    };
  }, [selectedDay, habits, report.dayPoints]);

  const habitDetail = useMemo(() => {
    if (!selectedHabitId) return null;
    const h = habits.find((x) => x.id === selectedHabitId);
    if (!h) return null;
    const todayISO = fmtISO(new Date());
    const cells = report.dayPoints.map((p) => {
      const dow = new Date(p.date + 'T00:00:00').getDay();
      const due = h.frequency === 'custom' ? (h.custom_days || []).includes(dow) : true;
      const isFuture = p.date > todayISO;
      const done = h.completions.includes(p.date);
      return { day: p.day, date: p.date, due, isFuture, done };
    });
    const doneCount = cells.filter((c) => c.done).length;
    const dueCount = cells.filter((c) => c.due && !c.isFuture).length;
    const missedCount = cells.filter((c) => c.due && !c.isFuture && !c.done).length;
    return { habit: h, cells, doneCount, dueCount, missedCount };
  }, [selectedHabitId, habits, report.dayPoints]);


  const canGoForward = (() => {
    const now = new Date();
    return month.getFullYear() < now.getFullYear() ||
      (month.getFullYear() === now.getFullYear() && month.getMonth() < now.getMonth());
  })();

  const changeMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    // Clamp: not further back than 11 months and never into the future
    const now = new Date();
    const earliest = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    if (next < earliest) return;
    if (next.getFullYear() > now.getFullYear() ||
      (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth())) return;
    setMonth(next);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground mb-4 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-h1 text-foreground">Monthly Progress</h1>
          <p className="text-caption text-muted-foreground mt-0.5">Charts, streaks, and per-habit trends.</p>
        </div>
      </div>

      {/* Month navigator */}
      <div className="glass rounded-card p-3 mb-5 shadow-card flex items-center justify-between">
        <button
          onClick={() => changeMonth(-1)}
          className="h-9 w-9 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 font-display font-bold text-body-lg text-foreground">
          <Calendar className="w-4 h-4 text-primary" />
          {monthLabel(month)}
        </div>
        <button
          onClick={() => changeMonth(1)}
          disabled={!canGoForward}
          className="h-9 w-9 rounded-full bg-secondary/60 hover:bg-secondary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="glass rounded-card p-8 text-center shadow-card">
          <p className="text-body text-muted-foreground">Loading your month…</p>
        </div>
      ) : habits.length === 0 ? (
        <div className="glass rounded-card p-8 text-center shadow-card">
          <p className="font-semibold text-body-lg text-foreground">No habits yet</p>
          <p className="text-body text-muted-foreground mt-1">
            Add a habit to start building your monthly report.
          </p>
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <StatTile icon={Target} label="Total completions" value={report.totalCompletions} />
            <StatTile icon={TrendingUp} label="Avg completion rate" value={`${report.avgRate}%`} tone="accent" />
            <StatTile
              icon={Award}
              label="Best day"
              value={report.bestDay ? `${report.bestDay.completed} on ${report.bestDay.day}` : '—'}
            />
            <StatTile icon={Flame} label="Avg per day" value={report.avgPerDay} tone="accent" />
          </div>

          {/* Completion rate bar chart */}
          <div className="glass rounded-card p-4 mb-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-h3 text-foreground">Completion Rate</h3>
              <span className="text-caption text-muted-foreground">
                Tap a bar for details
              </span>
            </div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={report.dayPoints} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    interval={report.totalDays > 20 ? 3 : 1}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 12,
                      color: 'hsl(var(--foreground))',
                      fontSize: 12,
                    }}
                    formatter={(value, _n, item) => [`${value}% (${item?.payload?.completed}/${item?.payload?.total})`, 'Completion']}
                    labelFormatter={(d) => `Day ${d}`}
                  />
                  <Bar
                    dataKey="rate"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    onClick={(data) => data?.date && setSelectedDay(data.date)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Streak trend line chart */}
          <div className="glass rounded-card p-4 mb-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-h3 text-foreground">Streak Trend</h3>
              <span className="text-caption text-muted-foreground">Rolling active days</span>
            </div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={report.streakPoints} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    interval={report.totalDays > 20 ? 3 : 1}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 12,
                      color: 'hsl(var(--foreground))',
                      fontSize: 12,
                    }}
                    labelFormatter={(d) => `Day ${d}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="streak"
                    stroke="hsl(var(--accent))"
                    strokeWidth={2.5}
                    dot={{ r: 2, fill: 'hsl(var(--accent))' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-habit percentages */}
          <div className="glass rounded-card p-4 shadow-card">
            <h3 className="font-semibold text-h3 text-foreground mb-3">Per Habit</h3>
            <p className="text-caption text-muted-foreground mb-3">Tap a habit for daily breakdown</p>
            <div className="space-y-3">
              {report.perHabit.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setSelectedHabitId(h.id)}
                  className="w-full flex items-center gap-3 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-secondary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <span className="text-lg shrink-0">{h.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-body font-medium text-foreground truncate">{h.name}</span>
                      <span className="text-caption text-muted-foreground shrink-0 ml-2">
                        {h.completed}/{report.elapsedDays} · {h.pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full gradient-primary rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, h.pct)}%` }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Day drill-down */}
      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDay
                ? new Date(selectedDay + 'T00:00:00').toLocaleDateString(undefined, {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })
                : ''}
            </DialogTitle>
            <DialogDescription>
              {dayDetail
                ? `${dayDetail.point.completed} of ${dayDetail.point.total} habits completed (${dayDetail.point.rate}%)`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {dayDetail?.items.length === 0 && (
              <p className="text-body text-muted-foreground text-center py-4">No habits due this day.</p>
            )}
            {dayDetail?.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/40">
                <span className="text-lg">{it.emoji}</span>
                <span className="flex-1 text-body text-foreground truncate">{it.name}</span>
                {it.done ? (
                  <span className="flex items-center gap-1 text-caption text-primary">
                    <Check className="w-4 h-4" /> Done
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-caption text-muted-foreground">
                    <X className="w-4 h-4" /> Missed
                  </span>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Habit drill-down */}
      <Dialog open={!!selectedHabitId} onOpenChange={(o) => !o && setSelectedHabitId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{habitDetail?.habit.emoji}</span>
              <span className="truncate">{habitDetail?.habit.name}</span>
            </DialogTitle>
            <DialogDescription>
              {habitDetail
                ? `${habitDetail.doneCount} done · ${habitDetail.missedCount} missed · ${monthLabel(month)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-7 gap-1.5">
            {habitDetail?.cells.map((c) => {
              const base = 'aspect-square rounded-md flex items-center justify-center text-[10px] font-medium';
              let cls = 'bg-secondary/40 text-muted-foreground';
              let icon: React.ReactNode = c.day;
              if (c.isFuture) {
                cls = 'bg-secondary/20 text-muted-foreground/50';
              } else if (!c.due) {
                cls = 'bg-secondary/30 text-muted-foreground/70';
                icon = <Minus className="w-3 h-3" />;
              } else if (c.done) {
                cls = 'bg-primary text-primary-foreground';
                icon = <Check className="w-3.5 h-3.5" />;
              } else {
                cls = 'bg-destructive/15 text-destructive';
                icon = <X className="w-3 h-3" />;
              }
              return (
                <div key={c.date} className={`${base} ${cls}`} title={`Day ${c.day}`}>
                  {icon}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-around text-caption text-muted-foreground pt-2 border-t border-border/50">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> Done</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive/15" /> Missed</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-secondary/30" /> Off</span>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
