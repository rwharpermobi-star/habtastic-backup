import { useEffect, useMemo, useRef, useState } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { motion, AnimatePresence } from 'framer-motion';
import { useHabits } from '@/hooks/useHabits';
import { useProfile } from '@/hooks/useProfile';
import { useAchievements } from '@/hooks/useAchievements';
import { useConfetti } from '@/hooks/useConfetti';
import RankBadge from '@/components/RankBadge';
import { formatLocalDate, parseLocalDate, isLocalDate, getLevelFromXP, getStreak as getHabitStreak } from '@/lib/habitStore';
import ProgressSkeleton from '@/components/skeletons/ProgressSkeleton';
import WeeklyReportCard from '@/components/WeeklyReportCard';
import HabitHeatmap from '@/components/HabitHeatmap';
import PremiumGate from '@/components/PremiumGate';
import ProgressionCard from '@/components/ProgressionCard';
import EmptyState from '@/components/EmptyState';
import MoneySaverProgressSummary from '@/components/MoneySaverProgressSummary';
import { FEATURES } from '@/lib/featureGating';
import {
  TrendingUp, TrendingDown, Target, Flame, Calendar, Trophy, Download,
  Sparkles, BarChart3, Zap, Award, Star, Crown, Lock, Activity, Medal,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getProgressBarColor } from '@/lib/habitStatus';
import { generateWeeklyReportPdf } from '@/lib/weeklyReportPdf';
import { toast } from 'sonner';

/* --------------------------- helpers --------------------------- */
function toISO(d: Date) { return formatLocalDate(d); }
function daysBack(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return toISO(d);
  });
}
function getLongestStreak(completions: string[]): number {
  const set = new Set(completions.filter(isLocalDate));
  if (!set.size) return 0;
  const sorted = [...set].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseLocalDate(sorted[i - 1]);
    const curr = parseLocalDate(sorted[i]);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) { cur++; best = Math.max(best, cur); } else { cur = 1; }
  }
  return best;
}

/* --------------------------- micro components --------------------------- */
function StatCard({
  icon: Icon, label, value, sub, color = 'primary', delay = 0,
}: {
  icon; label: string; value: string; sub?: string; color?: 'primary' | 'accent' | 'success' | 'warning'; delay?: number;
}) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary bg-primary/15',
    accent: 'text-accent bg-accent/15',
    success: 'text-emerald-400 bg-emerald-400/15',
    warning: 'text-amber-400 bg-amber-400/15',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="glass rounded-card p-4 shadow-card relative overflow-hidden"
    >
      <div className={`w-9 h-9 rounded-xl ${colorMap[color]} flex items-center justify-center mb-2`}>
        <Icon className="w-4.5 h-4.5" strokeWidth={2} />
      </div>
      <p className="font-bold text-h3 leading-tight">{value}</p>
      <p className="text-caption text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

function TrendPill({ delta }: { delta: number }) {
  const up = delta >= 0;
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-caption font-semibold ${
        up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
      }`}
    >
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {up ? '+' : ''}{delta}% vs last week
    </motion.div>
  );
}

/* --------------------------- page --------------------------- */
export default function Progress() {
  usePageMeta({
    title: 'Habit Progress & Analytics — HabTastic AI',
    description: 'Review streaks, completion rates and growth scores with detailed HabTastic AI habit analytics.',
    canonicalPath: '/progress',
  });

  const navigate = useNavigate();
  const { habits, loading: habitsLoading } = useHabits();
  const { profile, loading: profileLoading } = useProfile();

  // Avoid an endless progress skeleton when the API is unavailable or stalls.
  const [progressLoadTimedOut, setProgressLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!profileLoading && !habitsLoading) {
      setProgressLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setProgressLoadTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [profileLoading, habitsLoading]);
  const { achievements, unlockedCount } = useAchievements();
  const { fireConfetti } = useConfetti();

  const xp = profile?.xp || 0;
  const { level, progress: lvlProgress, title: levelTitle, emoji: levelEmoji } = getLevelFromXP(xp);
  const [view, setView] = useState<'week' | 'month' | 'year'>('week');

  /* -------- calculations (unchanged logic) -------- */
  const last7 = useMemo(() => daysBack(7), []);
  const prev7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i)); return toISO(d);
    });
  }, []);
  const last30 = useMemo(() => daysBack(30), []);
  const last365 = useMemo(() => daysBack(365), []);

  const rateFor = (day: string) =>
    habits.length ? Math.round((habits.filter(h => h.completions.includes(day)).length / habits.length) * 100) : 0;

  const weeklyData = last7.map(day => ({ day, rate: rateFor(day) }));
  const prevWeeklyAvg = prev7.reduce((s, d) => s + rateFor(d), 0) / 7;
  const avgCompletion = habits.length > 0 ? Math.round(weeklyData.reduce((s, d) => s + d.rate, 0) / 7) : 0;
  const weekDelta = Math.round(avgCompletion - prevWeeklyAvg);

  const monthlyAvg = habits.length
    ? Math.round(last30.reduce((s, d) => s + rateFor(d), 0) / 30)
    : 0;

  const bestStreak = habits.reduce((max, h) => Math.max(max, getHabitStreak(h as any)), 0);
  const longestEver = habits.reduce((m, h) => Math.max(m, getLongestStreak(h.completions)), 0);
  const totalCompletions = habits.reduce((sum, h) => sum + h.completions.length, 0);
  const growthScore = Math.min(100, Math.round((avgCompletion * 0.4) + (bestStreak * 3) + (level * 5)));

  // personal records
  const perfectDays = last365.filter(d => habits.length && habits.every(h => h.completions.includes(d))).length;
  const bestDay = last30.reduce((best, d) => {
    const r = rateFor(d);
    return r > best.rate ? { day: d, rate: r } : best;
  }, { day: '', rate: 0 });
  const mostConsistent = habits.reduce((best, h) => {
    const s = getLongestStreak(h.completions);
    return s > best.s ? { name: h.name, emoji: h.emoji, s } : best;
  }, { name: '—', emoji: '✨', s: 0 });

  // milestone confetti (celebrate on new level or big streak)
  const seenRef = useRef<{ level: number; streak: number } | null>(null);
  useEffect(() => {
    if (!profile || habitsLoading) return;
    const key = 'habtastic-milestone-seen';
    let seen: { level: number; streak: number } = { level: 0, streak: 0 };
    try { const raw = localStorage.getItem(key); if (raw) seen = JSON.parse(raw); } catch { /* ignore: best effort */ }
    if (!seenRef.current) seenRef.current = seen;

    const bigStreak = [7, 30, 100, 365].find(t => bestStreak >= t && seen.streak < t);
    const leveledUp = level > seen.level && seen.level > 0;
    if (bigStreak || leveledUp) {
      fireConfetti();
      toast.success(leveledUp ? `🎉 Level ${level} — ${levelTitle}!` : `🔥 ${bigStreak}-day streak!`);
    }
    if (seen.level !== level || seen.streak !== bestStreak) {
      try { localStorage.setItem(key, JSON.stringify({ level, streak: bestStreak })); } catch { /* ignore: best effort */ }
    }
  }, [level, bestStreak, profile, habitsLoading, fireConfetti, levelTitle]);

  // AI insight (Winston)
  const insight = useMemo(() => {
    if (habits.length === 0) return null;
    const praise = avgCompletion >= 80
      ? "You're crushing it this week — consistency is your superpower."
      : avgCompletion >= 50
      ? "Solid week. You're building real momentum."
      : "Every rep counts. Small wins today lead to big change.";
    const suggest = weekDelta < 0
      ? `Down ${Math.abs(weekDelta)}% vs last week — try one habit at your peak energy hour.`
      : bestStreak < 3
      ? "Aim for a 3-day streak this week to unlock Sprout mode."
      : monthlyAvg < 70
      ? "Focus on your top 2 habits daily to lift your monthly average."
      : "Add a stretch habit — you're ready for the next level.";
    return { praise, suggest };
  }, [avgCompletion, weekDelta, bestStreak, monthlyAvg, habits.length]);

  if (profileLoading || habitsLoading) {
    if (!progressLoadTimedOut) return <ProgressSkeleton />;
    return (
      <div className="min-h-screen pb-24 px-5 pt-20 bg-background flex items-center justify-center">
        <div role="alert" className="glass rounded-2xl p-6 max-w-sm w-full text-center">
          <h2 className="text-lg font-bold text-foreground">Progress could not load</h2>
          <p className="text-sm text-muted-foreground mt-2">
            HabTastic is taking too long to retrieve your progress. Check your connection and try again.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* -------- empty state -------- */
  if (habits.length === 0) {
    return (
      <motion.div
        className="min-h-screen pb-24 px-5 pt-14 bg-background"
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      >
        <h1 className="text-h1 text-foreground mb-6">Progress</h1>
        <MoneySaverProgressSummary />
        <EmptyState
          illustration="📈"
          title="Your progress starts here"
          message="Every champion starts somewhere. Complete your first habit to unlock streaks, charts, and your Growth Score."
          primary={{ label: 'Complete a Habit', icon: <Sparkles className="w-4 h-4" />, onClick: () => navigate('/habits') }}
          secondary={{ label: 'Talk to Winston', onClick: () => navigate('/coach') }}
        />
      </motion.div>
    );
  }


  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <div>
          <h1 className="text-h1 text-foreground">Progress</h1>
          <p className="text-caption text-muted-foreground mt-0.5">Your journey, visualized</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate('/progress/monthly')}
            className="p-2 rounded-xl bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
            aria-label="Monthly report"
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            onClick={async () => {
              try {
                const saved = await generateWeeklyReportPdf({ habits, level, levelTitle });
                toast.success(`Saved ${saved.filename}`, { description: `Find it in ${saved.location}.` });
              } catch (err) {
                const cancelled = /cancel/i.test(String((err as Error)?.message ?? err));
                toast.error(cancelled ? 'Report not saved' : 'Could not save the weekly report');
              }
            }}
            className="p-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/70 transition-colors"
            aria-label="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PRIMARY long-term progression: Level + XP + stars + next rewards */}
      <ProgressionCard xp={xp} />

      {/* Money Saver progress is additive; it does not replace habit analytics. */}
      <MoneySaverProgressSummary />

      {/* HERO — Growth Score + core stats (weekly performance, not progression) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative rounded-card overflow-hidden mb-5 shadow-card"
      >
        <div className="absolute inset-0 gradient-primary opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.25),transparent_50%),radial-gradient(circle_at_80%_90%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="relative p-5 text-primary-foreground">
          <div className="flex items-center gap-4">
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" />
                <motion.circle
                  cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray="264"
                  initial={{ strokeDashoffset: 264 }}
                  animate={{ strokeDashoffset: 264 - growthScore * 2.64 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-bold text-h1 leading-none">{growthScore}</span>
                <span className="text-[10px] opacity-80 mt-0.5">Growth</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-body-lg">Growth Score</p>
              <p className="text-caption opacity-90">This week's performance</p>
              <div className="h-1.5 bg-white/25 rounded-full overflow-hidden mt-2 mb-2">
                <motion.div
                  className="h-full bg-white rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${growthScore}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                />
              </div>
              <div className="flex items-center justify-between text-caption opacity-95">
                <span>Grade {growthScore >= 90 ? 'S' : growthScore >= 75 ? 'A' : growthScore >= 60 ? 'B' : growthScore >= 40 ? 'C' : 'D'}</span>
                <span>{avgCompletion}% habits done</span>
              </div>
            </div>
          </div>

          {/* 3 hero pills */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { icon: Flame, label: 'Streak', value: `${bestStreak}d` },
              { icon: Target, label: 'Weekly', value: `${avgCompletion}%` },
              { icon: Zap, label: 'Total', value: `${totalCompletions}` },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2.5 text-center"
              >
                <s.icon className="w-4 h-4 mx-auto mb-1 opacity-90" />
                <p className="font-bold text-body-lg leading-none">{s.value}</p>
                <p className="text-[10px] opacity-80 mt-1">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Trend pill */}
      <div className="mb-5">
        <TrendPill delta={weekDelta} />
      </div>

      {/* Rank badge — competitive standing vs other users */}
      <div className="mb-5">
        <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Your rank among players
        </p>
        <RankBadge xp={xp} variant="full" showTopPercent />
      </div>

      {/* Winston AI insight */}
      {insight && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass rounded-card p-4 mb-5 shadow-card border border-primary/20 relative overflow-hidden"
        >
          <div className="absolute -top-8 -right-8 w-24 h-24 bg-primary/20 rounded-full blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-[0_0_16px_hsl(var(--primary)/0.5)]">
              <Sparkles className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-caption font-semibold text-primary mb-1">Winston's Take</p>
              <p className="text-body font-medium leading-snug">{insight.praise}</p>
              <p className="text-caption text-muted-foreground mt-1.5 leading-snug">💡 {insight.suggest}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Personal Records */}
      <h2 className="font-bold text-body-lg mb-3 flex items-center gap-2">
        <Medal className="w-4.5 h-4.5 text-accent" /> Personal Records
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={Star} label="Best Day" value={`${bestDay.rate}%`} sub={bestDay.day || '—'} color="warning" delay={0} />
        <StatCard icon={Flame} label="Longest Streak" value={`${longestEver}d`} color="primary" delay={0.05} />
        <StatCard icon={Trophy} label="Perfect Days" value={`${perfectDays}`} sub="last 365 days" color="accent" delay={0.1} />
        <StatCard icon={Zap} label="Total XP" value={`${xp}`} color="success" delay={0.15} />
        <StatCard icon={Target} label="Habits Done" value={`${totalCompletions}`} color="primary" delay={0.2} />
        <StatCard icon={Activity} label="Top Habit" value={mostConsistent.emoji} sub={mostConsistent.name} color="accent" delay={0.25} />
      </div>

      {/* Achievements */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-body-lg flex items-center gap-2">
          <Award className="w-4.5 h-4.5 text-primary" /> Achievements
        </h2>
        <span className="text-caption text-muted-foreground">{unlockedCount}/{achievements.length}</span>
      </div>
      <div className="glass rounded-card p-4 mb-6 shadow-card">
        <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
          {achievements.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03, type: 'spring', stiffness: 260, damping: 20 }}
              className={`snap-start shrink-0 w-20 text-center ${a.unlocked ? '' : 'opacity-50'}`}
            >
              <div className={`relative w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-2xl ${
                a.unlocked
                  ? 'bg-gradient-to-br from-primary/25 to-accent/25 shadow-[0_0_16px_hsl(var(--primary)/0.35)]'
                  : 'bg-secondary/60'
              }`}>
                <span>{a.icon}</span>
                {!a.unlocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/40 rounded-2xl">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-semibold mt-1.5 truncate">{a.title}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Weekly Report */}
      <div className="mb-6">
        <WeeklyReportCard habits={habits} xp={xp} level={level} levelTitle={levelTitle} levelEmoji={levelEmoji} />
      </div>

      {/* Chart with Week/Month/Year tabs */}
      <PremiumGate
        feature={FEATURES.ADVANCED_ANALYTICS}
        fallbackTitle="Advanced Analytics"
        fallbackDescription="Unlock weekly, monthly & yearly charts with trend analysis."
      >
        <div className="glass rounded-card p-5 mb-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-body-lg flex items-center gap-2">
              <BarChart3 className="w-4.5 h-4.5 text-primary" /> Completion
            </h3>
            <div className="flex gap-1 bg-secondary/60 rounded-xl p-1">
              {(['week', 'month', 'year'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`relative px-3 py-1 rounded-lg text-caption font-semibold capitalize transition-colors ${
                    view === v ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {view === v && (
                    <motion.div
                      layoutId="chart-tab"
                      className="absolute inset-0 gradient-primary rounded-lg"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">{v}</span>
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {view === 'week' && (
                <div className="flex items-end justify-between gap-2 h-40">
                  {weeklyData.map((d, i) => (
                    <div key={d.day} className="flex flex-col items-center gap-1.5 flex-1 group">
                      <span className="text-[10px] text-muted-foreground font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.rate}%
                      </span>
                      <div className="w-full relative flex-1 flex items-end">
                        <motion.div
                          className="w-full rounded-t-lg rounded-b-sm"
                          style={{ backgroundColor: getProgressBarColor(d.rate) }}
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(4, d.rate)}%` }}
                          transition={{ duration: 0.7, delay: i * 0.05, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="text-caption text-muted-foreground">{dayLabels[parseLocalDate(d.day).getDay()]}</span>
                    </div>
                  ))}
                </div>
              )}

              {view === 'month' && (
                <div className="space-y-2.5">
                  {[
                    { label: 'Week 1', days: last30.slice(0, 7) },
                    { label: 'Week 2', days: last30.slice(7, 14) },
                    { label: 'Week 3', days: last30.slice(14, 21) },
                    { label: 'Week 4', days: last30.slice(21) },
                  ].map(({ label, days }, i) => {
                    const rate = habits.length
                      ? Math.round(days.reduce((s, day) => s + rateFor(day), 0) / days.length)
                      : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-caption text-muted-foreground w-14">{label}</span>
                        <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: getProgressBarColor(rate) }}
                            initial={{ width: 0 }}
                            animate={{ width: `${rate}%` }}
                            transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                          />
                        </div>
                        <span className="text-caption font-bold w-10 text-right" style={{ color: getProgressBarColor(rate) }}>
                          {rate}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {view === 'year' && (
                <div className="space-y-2.5">
                  {Array.from({ length: 12 }, (_, i) => {
                    const now = new Date();
                    const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
                    const monthDays = last365.filter(d => {
                      const dd = parseLocalDate(d);
                      return dd.getMonth() === monthDate.getMonth() && dd.getFullYear() === monthDate.getFullYear();
                    });
                    const rate = monthDays.length && habits.length
                      ? Math.round(monthDays.reduce((s, d) => s + rateFor(d), 0) / monthDays.length)
                      : 0;
                    const label = monthDate.toLocaleDateString(undefined, { month: 'short' });
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-caption text-muted-foreground w-10">{label}</span>
                        <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: getProgressBarColor(rate) }}
                            initial={{ width: 0 }}
                            animate={{ width: `${rate}%` }}
                            transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
                          />
                        </div>
                        <span className="text-caption font-bold w-10 text-right" style={{ color: getProgressBarColor(rate) }}>
                          {rate}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </PremiumGate>

      {/* Heatmap */}
      <div className="mb-6">
        <HabitHeatmap habits={habits} days={364} title="Consistency Heatmap" />
      </div>

      {/* Streak history — richer cards */}
      <h2 className="font-bold text-body-lg mb-3 flex items-center gap-2">
        <Flame className="w-4.5 h-4.5 text-primary" /> Streak History
      </h2>
      <div className="space-y-2.5">
        {habits.map((h, i) => {
          const cur = getHabitStreak(h as any);
          const best = getLongestStreak(h.completions);
          const done30 = last30.filter(d => h.completions.includes(d)).length;
          const perf = Math.round((done30 / 30) * 100);
          return (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.01 }}
              className="glass rounded-card p-4 shadow-card"
            >
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                  {h.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-body truncate">{h.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-caption text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-primary" /> {cur}d now
                    </span>
                    <span className="flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-400" /> {best}d best
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-caption text-muted-foreground">30d</p>
                  <p className="font-bold text-body-lg" style={{ color: getProgressBarColor(perf) }}>{perf}%</p>
                </div>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: getProgressBarColor(perf) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${perf}%` }}
                  transition={{ duration: 0.8, delay: i * 0.05, ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}