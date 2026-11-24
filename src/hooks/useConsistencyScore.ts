import { useMemo } from 'react';
import { useHabits, type DbHabit } from '@/hooks/useHabits';
import { formatLocalDate, todayStr } from '@/lib/habitStore';

export type PressureLevel = 'ahead' | 'onTrack' | 'behind' | 'slipping' | 'streakProtect' | 'idle';

export interface ConsistencyScore {
  /** 0-100 overall consistency (last 7 days, weighted toward today) */
  score: number;
  /** Today's completion ratio 0-1 */
  todayRatio: number;
  todayCompleted: number;
  todayTotal: number;
  /** Highest active streak across habits */
  bestStreak: number;
  /** Habits missed in the last 7 days */
  missedLast7: number;
  /** Soft pressure bucket — drives the messaging */
  pressure: PressureLevel;
  /** Coach-tone message + emoji matching the pressure level */
  message: string;
}

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0;
  let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatLocalDate(d);
    if (completions.includes(ds)) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function computeScore(habits: DbHabit[]) {
  const today = todayStr();
  const total = habits.length;

  if (total === 0) {
    return {
      score: 0,
      todayRatio: 0,
      todayCompleted: 0,
      todayTotal: 0,
      bestStreak: 0,
      missedLast7: 0,
    };
  }

  // 7-day window (today included)
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(formatLocalDate(d));
  }

  const dayRates = days.map(day => {
    const completed = habits.filter(h => h.completions.includes(day)).length;
    return completed / total;
  });

  // Weight today double — keeps "today still matters" pressure
  const weights = [1, 1, 1, 1, 1, 1, 2];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const weighted = dayRates.reduce((s, r, i) => s + r * weights[i], 0) / sumW;

  // Streak bonus (up to +10)
  const bestStreak = habits.reduce((m, h) => Math.max(m, getStreak(h.completions)), 0);
  const streakBonus = Math.min(10, bestStreak * 0.7);

  // Miss penalty: cap at -10
  const missedLast7 = days.slice(0, 6).reduce((acc, day) => {
    const c = habits.filter(h => h.completions.includes(day)).length;
    return acc + (total - c);
  }, 0);
  const missPenalty = Math.min(10, missedLast7 * 0.5);

  const raw = Math.round(weighted * 100 + streakBonus - missPenalty);
  const score = Math.max(0, Math.min(100, raw));

  const todayCompleted = habits.filter(h => h.completions.includes(today)).length;

  return {
    score,
    todayRatio: todayCompleted / total,
    todayCompleted,
    todayTotal: total,
    bestStreak,
    missedLast7,
  };
}

function pickPressure(s: ReturnType<typeof computeScore>): { level: PressureLevel; message: string } {
  if (s.todayTotal === 0) {
    return { level: 'idle', message: 'Add a habit to start your day 🌱' };
  }

  const hour = new Date().getHours();
  const ratio = s.todayRatio;

  // High streak → loss aversion takes priority
  if (s.bestStreak >= 7 && ratio < 1) {
    return { level: 'streakProtect', message: `You've come too far to quit 🔥 ${s.bestStreak}-day streak on the line.` };
  }

  if (ratio >= 1) {
    return { level: 'ahead', message: "You're ahead today 👀 Keep the lead." };
  }

  // Late evening, still incomplete → urgent
  if (hour >= 20 && ratio < 1) {
    return { level: 'slipping', message: "Don't let today slip ⚠️" };
  }

  if (ratio >= 0.5) {
    return { level: 'onTrack', message: "You're close… don't stop now 💪" };
  }

  if (hour >= 17) {
    return { level: 'behind', message: 'Time is moving. So should you ⏳' };
  }

  return { level: 'onTrack', message: 'Good morning. Make today count ☀️' };
}

export function useConsistencyScore(): ConsistencyScore {
  const { habits } = useHabits();

  return useMemo(() => {
    const base = computeScore(habits);
    const { level, message } = pickPressure(base);
    return { ...base, pressure: level, message };
  }, [habits]);
}
