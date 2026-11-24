import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useHabits } from '@/hooks/useHabits';
import { formatLocalDate, todayStr } from '@/lib/habitStore';
import { supabase } from '@/integrations/supabase/client';
import { syncProfileXpCache } from '@/hooks/profileCache';

// ─── Five rotating challenge templates ────────────────────────
// Each one defines: how the goal is computed, how progress is read from
// today's habit completions, and the coach-tone copy Winston uses.
export type ChallengeType = 'consistency' | 'intensity' | 'timing' | 'comeback' | 'focus';

export interface DailyChallengeTemplate {
  type: ChallengeType;
  emoji: string;
  title: string;
  description: string;
  rewardXp: number;
  // How many "units" need to be hit. Resolved per day from the user's habits.
  targetFor: (ctx: { totalHabits: number }) => number;
  // Which unit label to show in progress (e.g. "habits", "early habit")
  unitLabel: (target: number) => string;
  // Coach line shown when challenge is active and not yet done
  livePrompt: string;
  // Coach line shown after completion — direct, not a cheerleader
  completionLine: string;
}

const TEMPLATES: DailyChallengeTemplate[] = [
  {
    type: 'consistency',
    emoji: '🌱',
    title: 'Consistency check',
    description: 'Complete at least 1 habit today.',
    rewardXp: 25,
    targetFor: () => 1,
    unitLabel: () => 'habit',
    livePrompt: "One habit. That's the bar today. Don't overthink it.",
    completionLine: "Good. Showing up is the whole game.",
  },
  {
    type: 'intensity',
    emoji: '🔥',
    title: 'Power session',
    description: 'Finish 3 habits in one session today.',
    rewardXp: 60,
    targetFor: ({ totalHabits }) => Math.min(3, Math.max(1, totalHabits)),
    unitLabel: (n) => (n === 1 ? 'habit' : 'habits'),
    livePrompt: "Stack them. Three in a row. No phone in between.",
    completionLine: "That's how momentum is built. Notice the difference.",
  },
  {
    type: 'timing',
    emoji: '🌅',
    title: 'Early move',
    description: 'Complete a habit before 12 PM.',
    rewardXp: 40,
    targetFor: () => 1,
    unitLabel: () => 'morning win',
    livePrompt: "Get one done before noon. Set the tone for the day.",
    completionLine: "Morning earned. The rest of the day is leverage.",
  },
  {
    type: 'comeback',
    emoji: '↩️',
    title: 'Bounce back',
    description: 'Missed yesterday? Do 1 habit today and reset.',
    rewardXp: 35,
    targetFor: () => 1,
    unitLabel: () => 'habit',
    livePrompt: "Yesterday is gone. One small win today closes the loop.",
    completionLine: "You came back. That's the rare move most people skip.",
  },
  {
    type: 'focus',
    emoji: '🎯',
    title: 'Perfect day',
    description: 'No skipping — complete every habit today.',
    rewardXp: 80,
    targetFor: ({ totalHabits }) => Math.max(1, totalHabits),
    unitLabel: (n) => (n === 1 ? 'habit' : 'habits'),
    livePrompt: "All in. Every habit, no exceptions. You'll feel it tonight.",
    completionLine: "Perfect day logged. Discipline is just this, repeated.",
  },
];

// ─── Stable per-user / per-day picker ─────────────────────────
// Hash the date + user id so each user gets their own rotation
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickTemplate(userId: string, dateStr: string, missedYesterday: number): DailyChallengeTemplate {
  // Comeback always wins on a real bounce-back day — Winston should notice
  if (missedYesterday >= 2) {
    return TEMPLATES.find((t) => t.type === 'comeback')!;
  }
  const idx = hashStr(`${userId}-${dateStr}`) % TEMPLATES.length;
  return TEMPLATES[idx];
}

// ─── localStorage state per day (no DB schema change needed) ─
type Status = 'pending' | 'active' | 'completed';
interface PersistedState {
  date: string;
  type: ChallengeType;
  status: Status;
  acceptedAt?: number;
  completedAt?: number;
  rewardClaimed?: boolean;
}

const STORAGE_KEY = 'winston-daily-challenge-v1';
const STREAK_KEY = 'winston-challenge-streak-v1';

interface StreakState {
  /** Number of consecutive completed challenge days, ending on lastCompletedDate. */
  count: number;
  /** ISO date (yyyy-mm-dd) of the most recent completion. */
  lastCompletedDate: string;
  /** Best ever challenge streak — for bragging rights. */
  best: number;
}

function readState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}
function writeState(s: PersistedState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore: best effort */ }
}

function readStreak(): StreakState {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) return JSON.parse(raw) as StreakState;
  } catch { /* ignore: best effort */ }
  return { count: 0, lastCompletedDate: '', best: 0 };
}
function writeStreak(s: StreakState) {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch { /* ignore: best effort */ }
}

function daysBetween(a: string, b: string): number {
  // a, b are yyyy-mm-dd
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / 86400000);
}

/** Returns the *effective* streak as of `today`: if last completion is older
 * than yesterday, the streak is broken (0). Otherwise return stored count. */
export function getEffectiveStreak(today: string): { count: number; best: number; lastCompletedDate: string } {
  const s = readStreak();
  if (!s.lastCompletedDate) return { count: 0, best: s.best, lastCompletedDate: '' };
  const gap = daysBetween(s.lastCompletedDate, today);
  if (gap > 1) return { count: 0, best: s.best, lastCompletedDate: s.lastCompletedDate };
  return { count: s.count, best: s.best, lastCompletedDate: s.lastCompletedDate };
}

/** Bumps the streak to include `today`. Idempotent — calling twice on same day is safe. */
function commitStreakForToday(today: string): StreakState {
  const s = readStreak();
  if (s.lastCompletedDate === today) return s; // already counted
  const gap = s.lastCompletedDate ? daysBetween(s.lastCompletedDate, today) : Infinity;
  const nextCount = gap === 1 ? s.count + 1 : 1; // continue or restart at 1
  const next: StreakState = {
    count: nextCount,
    lastCompletedDate: today,
    best: Math.max(s.best, nextCount),
  };
  writeStreak(next);
  return next;
}

export function useDailyChallenge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { habits } = useHabits();
  const [status, setStatus] = useState<Status>('pending');
  const [acceptedAt, setAcceptedAt] = useState<number | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);
  const [streak, setStreak] = useState<{ count: number; best: number }>({ count: 0, best: 0 });

  const today = todayStr();

  // Compute "missed yesterday" to bias toward comeback challenge
  const missedYesterday = useMemo(() => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yStr = formatLocalDate(y);
    return habits.filter((h) => !h.completions.includes(yStr)).length;
  }, [habits]);

  const template = useMemo(
    () => pickTemplate(user?.id || 'anon', today, missedYesterday),
    [user?.id, today, missedYesterday]
  );

  // Hydrate / reset for a new day
  useEffect(() => {
    const saved = readState();
    if (!saved || saved.date !== today || saved.type !== template.type) {
      // New day or new template → reset to pending
      const fresh: PersistedState = { date: today, type: template.type, status: 'pending' };
      writeState(fresh);
      setStatus('pending');
      setAcceptedAt(undefined);
    } else {
      setStatus(saved.status);
      setAcceptedAt(saved.acceptedAt);
    }
    // Hydrate streak (effective — auto-resets if a day was missed)
    const eff = getEffectiveStreak(today);
    setStreak({ count: eff.count, best: eff.best });
    setHydrated(true);
  }, [today, template.type]);

  // Live progress derived from real habit completions today
  const target = template.targetFor({ totalHabits: habits.length });

  const progress = useMemo(() => {
    const completedToday = habits.filter((h) => h.completions.includes(today));

    switch (template.type) {
      case 'timing': {
        // "Before 12 PM" — only counts if it's still before noon OR was already
        // completed earlier (we can't time-stamp completions, so we credit if
        // the user has any completion AND it's still before noon today).
        const beforeNoon = new Date().getHours() < 12;
        return beforeNoon && completedToday.length > 0 ? 1 : (beforeNoon ? 0 : 0);
      }
      case 'consistency':
      case 'comeback':
        return Math.min(target, completedToday.length);
      case 'intensity':
      case 'focus':
        return Math.min(target, completedToday.length);
      default:
        return 0;
    }
  }, [habits, today, template.type, target]);

  const ratio = target > 0 ? progress / target : 0;
  const isAchieved = progress >= target && target > 0;

  // Auto-flip to "completed" the moment criteria is met (only if active)
  useEffect(() => {
    if (!hydrated) return;
    if (status === 'active' && isAchieved) {
      const next: PersistedState = {
        date: today,
        type: template.type,
        status: 'completed',
        acceptedAt,
        completedAt: Date.now(),
        rewardClaimed: false,
      };
      writeState(next);
      setStatus('completed');

      // Bump challenge streak (separate from per-habit streaks)
      const bumped = commitStreakForToday(today);
      setStreak({ count: bumped.count, best: bumped.best });

      // Server-authoritative: the XP amount comes from reward_rules, not the
      // client-side template, and is deduped per (reason, day).
      if (user && template.rewardXp > 0) {
        (async () => {
          try {
            const { data, error } = await supabase.rpc('claim_action_reward' as never, {
              _action: 'challenge_day',
              _ref_id: null,
              // Metadata only — the server proves the achievement from
              // habits.completions and never trusts this value.
              _ref_key: template.type,
            } as never);
            if (error) throw error;
            syncProfileXpCache(queryClient, user.id, Number((data as { xp?: number } | null)?.xp ?? 0));

            const claimed: PersistedState = { ...next, rewardClaimed: true };
            writeState(claimed);
          } catch (e) {
            // The server re-verifies the challenge from real habit completions
            // and pays once per day, so a decline here is expected, not a bug.
            console.warn('Daily challenge XP not awarded:', e);
            syncProfileXpCache(queryClient, user.id, 0);
          }
        })();
      }
    }
  }, [isAchieved, status, hydrated, today, template.type, template.rewardXp, acceptedAt, user, queryClient]);

  const accept = useCallback(() => {
    const now = Date.now();
    const next: PersistedState = {
      date: today,
      type: template.type,
      status: 'active',
      acceptedAt: now,
    };
    writeState(next);
    setStatus('active');
    setAcceptedAt(now);
  }, [today, template.type]);

  return {
    template,
    status,
    progress,
    target,
    ratio,
    isAchieved,
    hydrated,
    accept,
    streak,
  };
}
