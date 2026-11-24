import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { DbHabit } from '@/hooks/useHabits';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(), pending: vi.fn(), cancel: vi.fn(),
  schedule: vi.fn(), request: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: mocks.permissions, requestPermissions: mocks.request,
    getPending: mocks.pending, cancel: mocks.cancel, schedule: mocks.schedule,
  },
}));
vi.mock('@/lib/sfx', () => ({ playSirenLoop: vi.fn() }));

import { scheduleHabitReminders, cancelHabitReminders } from '@/lib/habitNotifications';

function habits(): DbHabit[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: 'habit-' + i, user_id: 'owner', name: 'Habit ' + i, emoji: '🎯',
    color: 'blue', frequency: 'daily', category: 'wellness', difficulty: 'hard',
    reminder_time: '09:00', reminder_enabled: true, reminder_tone: 'strong',
    sound_mode: 'siren', custom_days: [], completions: [],
    created_at: new Date(Date.UTC(2026, 8, i + 1)).toISOString(),
  }));
}
type Scheduled = { extra: { habitId: string; siren: boolean }; schedule: { at: Date } };
const scheduled = () => mocks.schedule.mock.calls.at(-1)?.[0].notifications as Scheduled[];

describe('native reminders across Premium expiry and renewal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T08:00:00Z'));
    vi.clearAllMocks();
    mocks.permissions.mockResolvedValue({ display: 'granted' });
    mocks.pending.mockResolvedValue({ notifications: [{ id: 123 }] });
    mocks.cancel.mockResolvedValue(undefined);
    mocks.schedule.mockResolvedValue(undefined);
  });
  afterEach(async () => {
    cancelHabitReminders();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    vi.useRealTimers();
  });

  it('pre-schedules the Free fallback beyond expiry without erasing saved preferences', async () => {
    const saved = habits();
    const end = Date.parse('2026-10-05T08:00:00Z');
    scheduleHabitReminders([...saved].reverse(), { isPremium: true, premiumUntil: end });
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    const before = scheduled().filter(n => n.schedule.at.getTime() < end);
    const after = scheduled().filter(n => n.schedule.at.getTime() >= end);
    expect(new Set(before.map(n => n.extra.habitId)).size).toBe(6);
    expect(new Set(after.map(n => n.extra.habitId))).toEqual(new Set(saved.slice(0, 4).map(h => h.id)));
    expect(after.every(n => !n.extra.siren && n.schedule.at.getHours() === 9)).toBe(true);
    expect(after).toHaveLength(24);
    expect(saved.every(h => h.sound_mode === 'siren' && h.reminder_tone === 'strong')).toBe(true);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('restores reminders for the same six habits when Premium returns', async () => {
    const saved = habits();
    scheduleHabitReminders(saved, { isPremium: false });
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    expect(new Set(scheduled().map(n => n.extra.habitId)).size).toBe(4);
    expect(scheduled().every(n => !n.extra.siren)).toBe(true);
    scheduleHabitReminders(saved, { isPremium: true });
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(2));
    expect(new Set(scheduled().map(n => n.extra.habitId)).size).toBe(6);
    expect(scheduled().every(n => n.extra.siren)).toBe(true);
  });

  it('does not re-add stale Premium reminders after an overlapping downgrade', async () => {
    let resolvePermission!: (value: { display: string }) => void;
    mocks.permissions.mockImplementationOnce(() => new Promise(resolve => { resolvePermission = resolve; }));
    scheduleHabitReminders(habits(), { isPremium: true });
    await vi.waitFor(() => expect(mocks.permissions).toHaveBeenCalledTimes(1));
    cancelHabitReminders();
    scheduleHabitReminders(habits(), { isPremium: false });
    resolvePermission({ display: 'granted' });
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    expect(new Set(scheduled().map(n => n.extra.habitId)).size).toBe(4);
    expect(scheduled().every(n => !n.extra.siren)).toBe(true);
  });

  it('respects disabled reminders and does not prompt for permissions in the background', async () => {
    const saved = habits(); saved[0].reminder_enabled = false;
    scheduleHabitReminders(saved, { isPremium: false });
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    expect(scheduled().every(n => n.extra.habitId !== saved[0].id)).toBe(true);
    mocks.permissions.mockResolvedValue({ display: 'denied' });
    scheduleHabitReminders(saved, { isPremium: true });
    await vi.waitFor(() => expect(mocks.permissions).toHaveBeenCalledTimes(2));
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
