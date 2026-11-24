import { formatLocalDate, parseLocalDate } from '@/lib/habitStore';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Flame, Target, TrendingUp, Share2, Trophy, Sparkles, Check, X } from 'lucide-react';
import SocialShareSheet from '@/components/SocialShareSheet';
import HabitStatusLegend from '@/components/HabitStatusLegend';
import PartialFillCircle from '@/components/PartialFillCircle';
import { getDayStatus, getStatusCircleClass, getProgressBarColor } from '@/lib/habitStatus';
import type { DbHabit } from '@/hooks/useHabits';

interface WeeklyReportCardProps {
  habits: DbHabit[];
  xp: number;
  level: number;
  levelTitle: string;
  levelEmoji: string;
}

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0;
  let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (completions.includes(formatLocalDate(d))) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function getGrade(score: number): { letter: string; color: string; label: string } {
  if (score >= 90) return { letter: 'S', color: 'from-yellow-400 to-amber-500', label: 'Legendary' };
  if (score >= 75) return { letter: 'A', color: 'from-primary to-accent', label: 'Excellent' };
  if (score >= 60) return { letter: 'B', color: 'from-blue-400 to-cyan-400', label: 'Great' };
  if (score >= 40) return { letter: 'C', color: 'from-orange-400 to-amber-400', label: 'Good Start' };
  return { letter: 'D', color: 'from-red-400 to-orange-400', label: 'Keep Going' };
}

export default function WeeklyReportCard({ habits, xp, level, levelTitle, levelEmoji }: WeeklyReportCardProps) {
  const [expanded, setExpanded] = useState(false);

  const report = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return formatLocalDate(d);
    });

    const dailyRates = last7.map(day => {
      const completed = habits.filter(h => h.completions.includes(day)).length;
      return { day, completed, total: habits.length, rate: habits.length > 0 ? Math.round((completed / habits.length) * 100) : 0 };
    });

    const avgRate = dailyRates.length > 0 ? Math.round(dailyRates.reduce((s, d) => s + d.rate, 0) / 7) : 0;
    const perfectDays = dailyRates.filter(d => d.rate === 100).length;
    const totalCompleted = dailyRates.reduce((s, d) => s + d.completed, 0);
    const totalPossible = dailyRates.reduce((s, d) => s + d.total, 0);
    const bestStreak = habits.reduce((max, h) => Math.max(max, getStreak(h.completions)), 0);
    const activeDays = dailyRates.filter(d => d.completed > 0).length;

    // Growth score based on multiple factors
    const growthScore = Math.min(100, Math.round(
      (avgRate * 0.35) + (perfectDays * 8) + (bestStreak * 2.5) + (activeDays * 3) + (level * 2)
    ));

    // Best and worst habits
    const habitStats = habits.map(h => {
      const weekCompletions = last7.filter(d => h.completions.includes(d)).length;
      return { ...h, weekCompletions, weekRate: Math.round((weekCompletions / 7) * 100) };
    }).sort((a, b) => b.weekRate - a.weekRate);

    const bestHabit = habitStats[0] || null;
    const worstHabit = habitStats[habitStats.length - 1] || null;

    const grade = getGrade(growthScore);

    return {
      dailyRates,
      avgRate,
      perfectDays,
      totalCompleted,
      totalPossible,
      bestStreak,
      activeDays,
      growthScore,
      grade,
      bestHabit,
      worstHabit,
      habitStats,
    };
  }, [habits, level]);

  const shareData = {
    type: 'report' as const,
    title: `Weekly Report: ${report.grade.letter} Grade!`,
    subtitle: `Growth Score: ${report.growthScore}/100`,
    emoji: '📊',
    stat: `${report.avgRate}% avg · ${report.perfectDays} perfect days · ${report.bestStreak}d streak`,
  };

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-card shadow-card overflow-hidden"
    >
      {/* Header with Grade */}
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-h3 text-foreground">Weekly Report Card</h3>
          </div>
          <SocialShareSheet data={shareData}>
            <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-btn bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors">
              <Share2 className="w-3 h-3" /> Share
            </button>
          </SocialShareSheet>
        </div>

        {/* Grade + Growth Score */}
        <div className="flex items-center gap-5 mb-4">
          <div className="relative">
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${report.grade.color} flex items-center justify-center shadow-lg`}>
              <span className="text-3xl font-black text-white drop-shadow-lg">{report.grade.letter}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-background border border-border text-[9px] font-bold text-foreground">
              {report.grade.label}
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-caption text-muted-foreground font-medium">Growth Score</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-black text-foreground">{report.growthScore}</span>
              <span className="text-caption text-muted-foreground mb-1">/100</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden mt-1.5">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: getProgressBarColor(report.growthScore) }}
                initial={{ width: 0 }}
                animate={{ width: `${report.growthScore}%` }}
                transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>

        {/* Key Stats Row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Target, label: 'Avg', value: `${report.avgRate}%`, accent: 'text-primary' },
            { icon: Trophy, label: 'Perfect', value: `${report.perfectDays}d`, accent: 'text-accent' },
            { icon: Flame, label: 'Streak', value: `${report.bestStreak}d`, accent: 'text-destructive' },
            { icon: TrendingUp, label: 'Active', value: `${report.activeDays}/7`, accent: 'text-primary' },
          ].map(({ icon: Icon, label, value, accent }) => (
            <div key={label} className="text-center p-2 rounded-btn bg-secondary/30">
              <Icon className={`w-3.5 h-3.5 ${accent} mx-auto mb-1`} />
              <p className="text-body-lg font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Color-coded day status row */}
      <div className="px-5 pb-3">
        <div className="flex items-center justify-between gap-1.5">
          {report.dailyRates.map((d, i) => {
            const status = getDayStatus(d.day, d.completed, d.total);
            return (
              <motion.div
                key={d.day}
                className="flex flex-col items-center gap-1 flex-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${getStatusCircleClass(status)}`}
                >
                  {status === 'completed' && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  {status === 'partial' && (
                    <PartialFillCircle size={18} ratio={d.total > 0 ? d.completed / d.total : 0.5} />
                  )}
                  {status === 'missed' && <X className="w-3.5 h-3.5" strokeWidth={3} />}
                  {status === 'today' && <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />}
                </div>
                <span className="text-[9px] text-muted-foreground">{dayLabels[parseLocalDate(d.day).getDay()]}</span>
              </motion.div>
            );
          })}
        </div>
        <HabitStatusLegend className="mt-3" />
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 text-center text-caption font-semibold text-primary border-t border-border/20 hover:bg-primary/5 transition-colors"
      >
        {expanded ? 'Show less ↑' : 'View full report ↓'}
      </button>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="px-5 pb-5 space-y-4"
        >
          {/* Top & Bottom Habit */}
          {report.bestHabit && (
            <div className="flex gap-3">
              <div className="flex-1 p-3 rounded-btn bg-primary/5 border border-primary/10">
                <p className="text-[10px] text-muted-foreground mb-1">⭐ Best Habit</p>
                <p className="text-caption font-bold text-foreground">{report.bestHabit.emoji} {report.bestHabit.name}</p>
                <p className="text-[10px] text-primary font-semibold">{report.bestHabit.weekRate}% this week</p>
              </div>
              {report.worstHabit && report.worstHabit.id !== report.bestHabit.id && (
                <div className="flex-1 p-3 rounded-btn bg-destructive/5 border border-destructive/10">
                  <p className="text-[10px] text-muted-foreground mb-1">💪 Needs Love</p>
                  <p className="text-caption font-bold text-foreground">{report.worstHabit.emoji} {report.worstHabit.name}</p>
                  <p className="text-[10px] text-destructive font-semibold">{report.worstHabit.weekRate}% this week</p>
                </div>
              )}
            </div>
          )}

          {/* All Habits Breakdown */}
          <div className="space-y-2">
            <p className="text-caption font-semibold text-muted-foreground">Habit Breakdown</p>
            {report.habitStats.map(h => (
              <div key={h.id} className="flex items-center gap-2">
                <span className="text-sm">{h.emoji}</span>
                <span className="text-caption text-foreground truncate flex-1">{h.name}</span>
                <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${h.weekRate}%`, backgroundColor: getProgressBarColor(h.weekRate) }}
                  />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{h.weekRate}%</span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="p-3 rounded-card bg-secondary/20 border border-border/20">
            <p className="text-caption text-muted-foreground leading-relaxed">
              You completed <span className="font-bold text-foreground">{report.totalCompleted}</span> out of{' '}
              <span className="font-bold text-foreground">{report.totalPossible}</span> habit check-ins this week.
              {report.perfectDays > 0 && ` You had ${report.perfectDays} perfect day${report.perfectDays > 1 ? 's' : ''}! 🌟`}
              {report.bestStreak >= 7 && ` Your ${report.bestStreak}-day streak is legendary! 🔥`}
            </p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
