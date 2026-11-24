import { useEffect, useMemo, useState, useRef } from 'react';
import type { DbHabit } from '@/hooks/useHabits';
import { todayStr } from '@/lib/habitStore';

// ============================================================================
// Winston Predictive Intervention + Mood System
// ----------------------------------------------------------------------------
// - Mood: tone shifts by hour-of-day (morning/afternoon/evening/late-night).
// - Predict: per-habit risk window (reminder_time OR median completion hour OR
//   sensible default based on category) on days the habit is scheduled.
// - Stages (per habit, per day):
//     pre-warn  → 30 min before window, not done
//     urgent    → inside window (±30 min), not done
//     harsh     → past window by >30 min, still not done
//     fixed     → user completed habit while a warning was active today
// - Escalation: stricter copy if user has ignored Winston's warnings in the
//   last 7 days OR multiple times today.
// - Notifications: dispatch browser notification at first transition to each
//   stage (one per habit/stage/day), respects permission, skipped silently if
//   not granted. UI keeps showing the highest-priority message regardless.
// ============================================================================

export type WinstonMood = 'morning' | 'afternoon' | 'evening' | 'late';
export type PredictionStage = 'pre-warn' | 'urgent' | 'harsh' | 'fixed' | 'mood';

export interface WinstonMessage {
  id: string;            // habitId+stage+day, or 'mood:date'
  habitId?: string;
  habitName?: string;
  emoji?: string;
  stage: PredictionStage;
  mood: WinstonMood;
  text: string;
  cta?: string;
}

const IGNORE_LOG_KEY = 'winston-ignored-warnings'; // {date: count} rolling
const STAGE_FIRED_KEY = 'winston-stage-fired';     // {date: {habitId: {stage:1}}}
const ACK_FIRED_KEY = 'winston-ack-fired';         // {date: {habitId:1}}
const ACTIVE_WARN_KEY = 'winston-active-warns';    // {date: {habitId: stage}}

// ---------- mood ----------
export function getMood(date = new Date()): WinstonMood {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'late';
}

const MOOD_COPY: Record<WinstonMood, string[]> = {
  morning: [
    'Start strong. Set the tone.',
    'Fresh day. First win — go.',
    'Mornings make momentum. Move.',
  ],
  afternoon: [
    "Stay on track. Don't slow down now.",
    'Halfway zone. Keep the pace.',
    'Afternoon dip is real. Push through one habit.',
  ],
  evening: [
    'Finish what you started.',
    'Evening check — close the loops.',
    "Don't end the day with regrets. One more.",
  ],
  late: [
    'You should be winding down. Reset for tomorrow.',
    'Late hour. Wrap it up — sleep is the next habit.',
    "Tomorrow starts now. Don't burn it.",
  ],
};

// ---------- helpers ----------
function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore: best effort */ }
}

function isHabitDueToday(habit: DbHabit, date = new Date()): boolean {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'custom') return (habit.custom_days || []).includes(date.getDay());
  return true;
}

function parseTimeStr(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return h >= 0 && h < 24 ? h : null;
}

function inferHabitHour(habit: DbHabit): number {
  const reminder = parseTimeStr(habit.reminder_time);
  if (reminder !== null) return reminder;
  const created = habit.created_at ? new Date(habit.created_at).getHours() : NaN;
  if (!Number.isNaN(created)) return created;
  // Category fallback
  switch (habit.category) {
    case 'health': return 7;
    case 'fitness': return 17;
    case 'mind': return 21;
    case 'learning': return 19;
    default: return 9;
  }
}

interface RiskState {
  habit: DbHabit;
  windowHour: number;
  minutesToWindow: number; // negative = past window
  stage: PredictionStage | null;
}

function computeRisk(habit: DbHabit, now: Date): RiskState {
  const today = todayStr();
  const done = habit.completions.includes(today);
  const windowHour = inferHabitHour(habit);
  const winMs = new Date(now).setHours(windowHour, 0, 0, 0);
  const diffMin = Math.round((winMs - now.getTime()) / 60000);

  if (done) return { habit, windowHour, minutesToWindow: diffMin, stage: null };

  // pre-warn: 30 min before window down to start of window
  if (diffMin <= 30 && diffMin > 0) return { habit, windowHour, minutesToWindow: diffMin, stage: 'pre-warn' };
  // urgent: inside ±30 min of window
  if (diffMin <= 0 && diffMin > -30) return { habit, windowHour, minutesToWindow: diffMin, stage: 'urgent' };
  // harsh: past window by 30 min, but still same day
  if (diffMin <= -30 && diffMin > -180) return { habit, windowHour, minutesToWindow: diffMin, stage: 'harsh' };
  return { habit, windowHour, minutesToWindow: diffMin, stage: null };
}

// ---------- copy ----------
const PRE_WARN = [
  "You usually skip this around now. Do it before you don't.",
  'Window opening. Move now and you keep the streak.',
  'Heads up — your pattern says this slips here. Beat it.',
];
const URGENT = [
  "You're about to miss this. Move now.",
  "This is the moment. Two minutes — no excuses.",
  "Right now or never. Pick the small version and go.",
];
const HARSH = [
  'This is where you fail. Change it.',
  'Past your usual time. Salvage it — anything counts.',
  "You're making it harder by waiting. Just start.",
];
const HARSH_STRICTER = [
  'Same pattern. Same excuse. Different choice — now.',
  "I warned you. Don't make me right.",
  "Stop scrolling. Do the habit. That's it.",
];

function pick(arr: string[], seed: string): string {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

// ---------- hook ----------
export function useWinstonPrediction(habits: DbHabit[], habitsLoaded: boolean) {
  const [tick, setTick] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const lastCompletionsRef = useRef<Record<string, string[]>>({});

  // 60-second tick — keep UI fresh without heavy work
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Detect "fix": user completed habit while a warning was active today
  useEffect(() => {
    if (!habitsLoaded) return;
    const today = todayStr();
    const active = readJSON<Record<string, Record<string, PredictionStage>>>(ACTIVE_WARN_KEY, {});
    const acks = readJSON<Record<string, Record<string, 1>>>(ACK_FIRED_KEY, {});
    const todayActive = active[today] || {};
    const todayAcks = acks[today] || {};
    let changed = false;
    for (const h of habits) {
      const prev = lastCompletionsRef.current[h.id] || h.completions;
      const wasDone = prev.includes(today);
      const nowDone = h.completions.includes(today);
      if (!wasDone && nowDone && todayActive[h.id] && !todayAcks[h.id]) {
        todayAcks[h.id] = 1;
        changed = true;
      }
      lastCompletionsRef.current[h.id] = h.completions;
    }
    if (changed) writeJSON(ACK_FIRED_KEY, { ...acks, [today]: todayAcks });
  }, [habits, habitsLoaded]);

  const result = useMemo(() => {
    void tick; // re-evaluate on tick
    if (!habitsLoaded || habits.length === 0) {
      return { message: null as WinstonMessage | null, mood: getMood() };
    }

    const now = new Date();
    const today = todayStr();
    const mood = getMood(now);

    // Escalation context
    const ignoreLog = readJSON<Record<string, number>>(IGNORE_LOG_KEY, {});
    const last7 = Object.entries(ignoreLog)
      .filter(([d]) => {
        const dt = new Date(d).getTime();
        return now.getTime() - dt < 7 * 86400000;
      })
      .reduce((s, [, n]) => s + n, 0);
    const ignoredToday = ignoreLog[today] || 0;
    const stricter = last7 >= 3 || ignoredToday >= 2;

    // 1. Acknowledgment beats warnings
    const acks = readJSON<Record<string, Record<string, 1>>>(ACK_FIRED_KEY, {})[today] || {};
    const ackedHabitId = Object.keys(acks).find(id => habits.some(h => h.id === id));
    if (ackedHabitId) {
      const h = habits.find(x => x.id === ackedHabitId)!;
      const ackId = `ack:${today}:${ackedHabitId}`;
      if (!dismissedIds.has(ackId)) {
        return {
          mood,
          message: {
            id: ackId,
            habitId: h.id,
            habitName: h.name,
            emoji: h.emoji,
            stage: 'fixed' as PredictionStage,
            mood,
            text: 'Good. You fixed it.',
            cta: undefined,
          },
        };
      }
    }

    // 2. Highest-priority active warning (harsh > urgent > pre-warn)
    const due = habits.filter(h => isHabitDueToday(h, now));
    const risks = due.map(h => computeRisk(h, now)).filter(r => r.stage !== null);
    const order: Record<string, number> = { harsh: 3, urgent: 2, 'pre-warn': 1 };
    risks.sort((a, b) => (order[b.stage!] || 0) - (order[a.stage!] || 0));
    const top = risks[0];

    if (top && top.stage) {
      const msgId = `${top.habit.id}:${top.stage}:${today}`;
      // Mark as active so a later completion can be detected as "fix"
      const active = readJSON<Record<string, Record<string, PredictionStage>>>(ACTIVE_WARN_KEY, {});
      const todayActive = active[today] || {};
      if (todayActive[top.habit.id] !== top.stage) {
        todayActive[top.habit.id] = top.stage;
        writeJSON(ACTIVE_WARN_KEY, { ...active, [today]: todayActive });
      }
      if (!dismissedIds.has(msgId)) {
        let text: string;
        if (top.stage === 'pre-warn') text = pick(PRE_WARN, msgId);
        else if (top.stage === 'urgent') text = pick(URGENT, msgId);
        else text = pick(stricter ? HARSH_STRICTER : HARSH, msgId);
        return {
          mood,
          message: {
            id: msgId,
            habitId: top.habit.id,
            habitName: top.habit.name,
            emoji: top.habit.emoji,
            stage: top.stage,
            mood,
            text,
            cta: 'Do it now',
          },
        };
      }
    }

    // 3. Mood baseline (one per mood per day)
    const moodId = `mood:${today}:${mood}`;
    if (!dismissedIds.has(moodId) && !localStorage.getItem(`winston-mood-shown-${moodId}`)) {
      // Only show mood card if there's still pending work
      const pendingCount = due.filter(h => !h.completions.includes(today)).length;
      if (pendingCount > 0) {
        return {
          mood,
          message: {
            id: moodId,
            stage: 'mood' as PredictionStage,
            mood,
            text: pick(MOOD_COPY[mood], moodId),
          },
        };
      }
    }
    return { mood, message: null as WinstonMessage | null };
  }, [habits, habitsLoaded, tick, dismissedIds]);

  // Fire browser notification + record stage transitions
  useEffect(() => {
    const m = result.message;
    if (!m) return;
    if (m.stage === 'fixed' || m.stage === 'mood') return;
    const today = todayStr();
    const fired = readJSON<Record<string, Record<string, Record<string, 1>>>>(STAGE_FIRED_KEY, {});
    const todayFired = fired[today] || {};
    const habitFired = todayFired[m.habitId || ''] || {};
    if (habitFired[m.stage]) return;
    habitFired[m.stage] = 1;
    todayFired[m.habitId || ''] = habitFired;
    fired[today] = todayFired;
    writeJSON(STAGE_FIRED_KEY, fired);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const title = m.stage === 'pre-warn' ? '⏰ Winston: heads up'
          : m.stage === 'urgent' ? '⚡ Winston: do it now'
          : '🚨 Winston: act now';
        new Notification(title, {
          body: m.habitName ? `${m.emoji || ''} ${m.habitName} — ${m.text}` : m.text,
          tag: `winston-${m.habitId}-${m.stage}`,
        });
      } catch { /* ignore */ }
    }
  }, [result.message]);

  const dismiss = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // mood: persist so it doesn't re-show this mood window today
    if (id.startsWith('mood:')) {
      try { localStorage.setItem(`winston-mood-shown-${id}`, '1'); } catch { /* ignore: best effort */ }
    }
    // pre-warn / urgent / harsh dismissal counts as ignored
    if (/:(pre-warn|urgent|harsh):/.test(id)) {
      const today = todayStr();
      const log = readJSON<Record<string, number>>(IGNORE_LOG_KEY, {});
      log[today] = (log[today] || 0) + 1;
      writeJSON(IGNORE_LOG_KEY, log);
    }
  };

  return { mood: result.mood, message: result.message, dismiss };
}
