import { formatLocalDate } from '@/lib/habitStore';
import type { DbHabit } from '@/hooks/useHabits';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { playSirenLoop } from '@/lib/sfx';
import { resolveSoundMode } from '@/lib/habitSoundPrefs';
import { getExactAlarmStatus } from '@/lib/exactAlarms';
// Re-export from the canonical source so existing importers keep working.
export { getXpForDifficulty } from '@/lib/habitStore';

/**
 * Difficulty → reminder cadence
 *  - easy:   1 reminder/day at the chosen time
 *  - medium: 2 reminders (chosen time + +6h)
 *  - hard:   3 reminders (chosen time, +4h, +8h) with urgent tone
 */
export function getReminderOffsets(difficulty: string): number[] {
  if (difficulty === 'easy') return [0];
  if (difficulty === 'hard') return [0, 4 * 60, 8 * 60]; // minutes
  return [0, 6 * 60];
}


export function isHabitDueOn(habit: Pick<DbHabit, 'frequency' | 'custom_days'>, date: Date): boolean {
  if (habit.frequency === 'daily' || habit.frequency === 'weekly') return true;
  if (habit.frequency === 'custom') {
    const dow = date.getDay(); // 0=Sun
    return (habit.custom_days || []).includes(dow);
  }
  return true;
}

/**
 * Compute the next firing Date >= `from` for a given habit base time and offset (minutes).
 * Walks forward up to 14 days to handle custom weekly schedules.
 */
export function computeNextOccurrence(
  habit: Pick<DbHabit, 'frequency' | 'custom_days' | 'reminder_time'>,
  offsetMin: number,
  from: Date = new Date(),
): Date | null {
  if (!habit.reminder_time) return null;
  const [h, m] = habit.reminder_time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  for (let i = 0; i < 14; i++) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + i);
    candidate.setHours(h, m, 0, 0);
    candidate.setMinutes(candidate.getMinutes() + offsetMin);
    if (candidate.getTime() <= from.getTime()) continue;
    if (!isHabitDueOn(habit, candidate)) continue;
    return candidate;
  }
  return null;
}

export interface ReminderAccess {
  isPremium: boolean;
  premiumUntil?: number;
}

const FREE_REMINDER_HABIT_LIMIT = 4;
let reminderAccess: ReminderAccess = { isPremium: false };
let nativeGeneration = 0;
let nativeQueue: Promise<void> = Promise.resolve();

function reminderHabit(
  habit: DbHabit, habitIndex: number, offsetIndex: number, at: Date,
  access: ReminderAccess,
): DbHabit | null {
  const premium = access.isPremium
    && (access.premiumUntil === undefined || at.getTime() < access.premiumUntil);
  if (premium) return habit;
  if (habitIndex >= FREE_REMINDER_HABIT_LIMIT || offsetIndex > 0) return null;
  // Keep the saved sound/difficulty preferences; only the delivered reminder
  // falls back to Free's ordinary tone and single daily reminder.
  return { ...habit, sound_mode: 'normal' };
}

interface ScheduledTimer { habitId: string; timeoutId: number }
let webTimers: ScheduledTimer[] = [];
let lastTzOffset: number | null = null;
let tzPoll: number | null = null;

function clearWebTimers() {
  webTimers.forEach(s => window.clearTimeout(s.timeoutId));
  webTimers = [];
}

function fireWebNotification(habit: DbHabit, urgent: boolean) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const today = formatLocalDate(new Date());
  if (habit.completions.includes(today)) return;
  const mode = resolveSoundMode(habit.difficulty, habit.sound_mode);
  const useSiren = mode === 'siren';
  const title = useSiren ? `🚨 ${habit.emoji} ${habit.name}` : `${habit.emoji} ${habit.name}`;
  const body = urgent || useSiren
    ? "Don't break the chain — take 2 minutes and do it now."
    : 'Time for your habit. Small action now = big results later.';
  try {
    new Notification(title, {
      body,
      icon: '/app-icon-512.png',
      badge: '/app-icon-512.png',
      tag: `habit-${habit.id}`,
      requireInteraction: useSiren || urgent,
    });
    if (useSiren) playSirenLoop(4000);
  } catch { /* noop */ }
}

/** Stable numeric ID for native LocalNotifications (id must be int32). */
function notifId(habitId: string, offsetIdx: number): number {
  let h = 0;
  for (let i = 0; i < habitId.length; i++) h = (h * 31 + habitId.charCodeAt(i)) | 0;
  return Math.abs(h % 1_000_000) * 10 + offsetIdx;
}

async function scheduleNative(habits: DbHabit[], access: ReminderAccess, generation: number) {
  try {
    const perm = await LocalNotifications.checkPermissions();
    // Background scheduling must not open a permission prompt on app startup.
    if (perm.display !== 'granted' || generation !== nativeGeneration) return;
    // Ask for exact alarms only when the user has allowed them. Otherwise the
    // plugin would open the Alarms & reminders screen on every app focus;
    // inexact alarms still deliver the reminder, just possibly a bit late.
    const exact = (await getExactAlarmStatus()) !== 'denied';
    if (generation !== nativeGeneration) return;
    // Cancel everything we previously scheduled then re-add for next 7 days
    const pending = await LocalNotifications.getPending();
    if (generation !== nativeGeneration) return;
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const toSchedule: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];

    habits.forEach((habit, habitIndex) => {
      if (!habit.reminder_time || !habit.reminder_enabled) return;
      const offsets = getReminderOffsets(habit.difficulty);
      offsets.forEach((offsetMin, idx) => {
        let cursor = new Date(now);
        // Schedule each occurrence inside the 7-day horizon
        while (cursor < horizon) {
          const next = computeNextOccurrence(habit, offsetMin, cursor);
          if (!next || next > horizon) break;
          const effective = reminderHabit(habit, habitIndex, idx, next, access);
          if (!effective) break;
          if (habit.completions.includes(formatLocalDate(next))) {
            cursor = new Date(next.getTime() + 60 * 1000);
            continue;
          }
          const useSiren = resolveSoundMode(effective.difficulty, effective.sound_mode) === 'siren';
          toSchedule.push({
            id: notifId(habit.id + ':' + idx + ':' + formatLocalDate(next), idx),
            title: useSiren ? `🚨 ${habit.emoji} ${habit.name}` : `${habit.emoji} ${habit.name}`,
            body: useSiren
              ? "Siren! Hit it now — keep your streak alive."
              : 'Time for your habit. A small action now = big results later.',
            schedule: { at: next, allowWhileIdle: true },
            isExactNotification: exact,
            // Android 8+ uses the app's notification channel sound. Do not
            // reference a custom file unless it is actually bundled in res/raw.
            smallIcon: 'ic_stat_habtastic',
            extra: { habitId: habit.id, siren: useSiren },
          });
          cursor = new Date(next.getTime() + 60 * 1000);
        }
      });
    });

    if (generation !== nativeGeneration) return;
    if (toSchedule.length) {
      // Native API caps at ~64 pending iOS notifications; trim if needed.
      toSchedule.sort((a, b) => (a.schedule?.at?.getTime() ?? 0) - (b.schedule?.at?.getTime() ?? 0));
      await LocalNotifications.schedule({ notifications: toSchedule.slice(0, 60) });
    }
  } catch (e) {
    console.warn('[habitNotifications] native schedule failed', e);
  }
}

function scheduleWeb(habits: DbHabit[], access: ReminderAccess) {
  clearWebTimers();
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const now = new Date();

  habits.forEach((habit, habitIndex) => {
    if (!habit.reminder_time || !habit.reminder_enabled) return;
    const offsets = getReminderOffsets(habit.difficulty);
    offsets.forEach((offsetMin, idx) => {
      const next = computeNextOccurrence(habit, offsetMin, now);
      if (!next || !reminderHabit(habit, habitIndex, idx, next, access)) return;
      const ms = next.getTime() - now.getTime();
      // Only schedule timers within 24h (browser tab will re-schedule daily)
      if (ms <= 0 || ms > 24 * 60 * 60 * 1000) return;
      const id = window.setTimeout(() => {
        const effective = reminderHabit(habit, habitIndex, idx, new Date(), access);
        if (effective) fireWebNotification(effective, habit.difficulty === 'hard' && idx > 0);
      }, ms);
      webTimers.push({ habitId: habit.id, timeoutId: id });
    });
  });
}

let lastHabitsRef: DbHabit[] = [];

/**
 * Schedules reminders for the given habits across web + native.
 * Re-schedules automatically when the device timezone offset changes.
 */
function queueNative(habits: DbHabit[], access: ReminderAccess) {
  const generation = ++nativeGeneration;
  nativeQueue = nativeQueue.then(() => scheduleNative(habits, access, generation));
}

export function scheduleHabitReminders(habits: DbHabit[], access: ReminderAccess = { isPremium: false }) {
  lastHabitsRef = [...habits].sort((a, b) =>
    Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  reminderAccess = access;
  scheduleWeb(lastHabitsRef, access);
  if (Capacitor.isNativePlatform()) queueNative(lastHabitsRef, access);

  // Track timezone changes (e.g. user travels) and reschedule.
  if (lastTzOffset === null) lastTzOffset = new Date().getTimezoneOffset();
  if (tzPoll === null) {
    tzPoll = window.setInterval(() => {
      const current = new Date().getTimezoneOffset();
      if (current !== lastTzOffset) {
        lastTzOffset = current;
        scheduleWeb(lastHabitsRef, reminderAccess);
        if (Capacitor.isNativePlatform()) queueNative(lastHabitsRef, reminderAccess);
      }
    }, 60 * 1000);
  }
}

export function cancelHabitReminders() {
  clearWebTimers();
  if (tzPoll !== null) { window.clearInterval(tzPoll); tzPoll = null; }
  lastTzOffset = null;
  lastHabitsRef = [];
  if (Capacitor.isNativePlatform()) {
    const generation = ++nativeGeneration;
    nativeQueue = nativeQueue.then(async () => {
      if (generation !== nativeGeneration) return;
      const pending = await LocalNotifications.getPending();
      if (generation === nativeGeneration && pending.notifications.length) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
      }
    }).catch(() => {});

  }
}

/** Backwards-compat alias used elsewhere. */
export const isHabitDueToday = (habit: Pick<DbHabit, 'frequency' | 'custom_days'>, date = new Date()) =>
  isHabitDueOn(habit, date);
