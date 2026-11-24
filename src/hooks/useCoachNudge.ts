import { formatLocalDate, parseLocalDate, isLocalDate } from '@/lib/habitStore';
import { useState, useEffect, useMemo } from 'react';
import { DbHabit } from '@/hooks/useHabits';

interface NudgeResult {
  nudge: { message: string } | null;
  dismissNudge: () => void;
}

const MISSED_MESSAGES = [
  "Hey, it looks like things didn't go as planned — and that's totally fine!\n\nEven the best athletes have rest days… though yours wasn't exactly planned. 😄\n\nWhat's one small thing you can do right now?",
  "I noticed you missed some habits yesterday. No judgment — life happens.\n\nBut let's not make it a habit to miss habits, shall we? 😉\n\nReady to bounce back today?",
  "You took a little break yesterday. Even superheroes need downtime!\n\nBut the city of Good Habits needs its hero back. Ready to save the day? 🦸",
];

const STREAK_MESSAGES = [
  "🔥 You're riding a streak. Don't break it today — one habit, right now.",
  "Momentum is real. Keep that streak alive — pick the easiest habit and crush it.",
  "Streaks compound. One more day. You know what to do.",
];

const INACTIVE_MESSAGES = [
  "Quiet a few days. Time to move — start with the smallest habit on your list.",
  "Welcome back. Don't overthink it — one habit, two minutes, right now.",
  "Long pause. No drama. Restart with one win today.",
];

const DANGER_MESSAGE = "🚨 Heads up — your streak is about to pull a disappearing act!\n\nYou've got hours left. Even one tiny habit counts.\n\nDon't let Monday win. Let's do this! ⚡";

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getStreak(completions: string[]): number {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = formatLocalDate(d);
    if (completions.includes(ds)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getLastActivity(habits: DbHabit[]): string | null {
  let latest: string | null = null;
  for (const h of habits) {
    for (const c of h.completions) {
      if (isLocalDate(c) && (!latest || c > latest)) latest = c;
    }
  }
  return latest;
}

export function useCoachNudge(habits: DbHabit[], habitsLoaded: boolean): NudgeResult {
  const [nudge, setNudge] = useState<{ message: string } | null>(null);

  const yesterday = useMemo(() => getYesterday(), []);

  useEffect(() => {
    if (!habitsLoaded || habits.length === 0) return;

    const hour = new Date().getHours();
    const today = formatLocalDate(new Date());
    const dailyHabits = habits.filter(h => h.frequency === 'daily');
    if (dailyHabits.length === 0) return;

    const completedToday = dailyHabits.filter(h => h.completions.includes(today)).length;
    const completedYesterday = dailyHabits.filter(h => h.completions.includes(yesterday)).length;
    const missedYesterday = dailyHabits.length - completedYesterday;
    const bestStreak = Math.max(...dailyHabits.map(h => getStreak(h.completions)), 0);
    const lastActivity = getLastActivity(habits);
    const daysSinceActivity = lastActivity
      ? Math.floor((Date.now() - parseLocalDate(lastActivity).getTime()) / 86400000)
      : 999;

    // 1. Danger: late in day with nothing done
    const dangerKey = `daily-growth-danger-${today}`;
    if (hour >= 18 && completedToday === 0 && !localStorage.getItem(dangerKey)) {
      localStorage.setItem(dangerKey, '1');
      const timer = setTimeout(() => setNudge({ message: DANGER_MESSAGE }), 400);
      return () => clearTimeout(timer);
    }

    // 2. Inactive: no activity 3+ days
    const inactiveKey = `coach-nudge-inactive-${today}`;
    if (daysSinceActivity >= 3 && !localStorage.getItem(inactiveKey)) {
      localStorage.setItem(inactiveKey, '1');
      const timer = setTimeout(() => setNudge({ message: pickRandom(INACTIVE_MESSAGES) }), 600);
      return () => clearTimeout(timer);
    }

    // 3. Missed habits yesterday (more than half)
    const missedKey = `daily-growth-nudge-${yesterday}`;
    if (missedYesterday > dailyHabits.length / 2 && !localStorage.getItem(missedKey) && completedToday === 0) {
      localStorage.setItem(missedKey, '1');
      const timer = setTimeout(() => setNudge({ message: pickRandom(MISSED_MESSAGES) }), 800);
      return () => clearTimeout(timer);
    }

    // 4. Active streak reinforcement (3+ days, hasn't done today yet, before evening)
    const streakKey = `coach-nudge-streak-${today}`;
    if (bestStreak >= 3 && completedToday === 0 && hour >= 10 && hour < 18 && !localStorage.getItem(streakKey)) {
      localStorage.setItem(streakKey, '1');
      const timer = setTimeout(() => setNudge({ message: pickRandom(STREAK_MESSAGES) }), 800);
      return () => clearTimeout(timer);
    }
  }, [habitsLoaded, habits, yesterday]);

  const dismissNudge = () => setNudge(null);

  return { nudge, dismissNudge };
}
