import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DbHabit } from '@/hooks/useHabits';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(), pending: vi.fn(), cancel: vi.fn(), schedule: vi.fn(),
  checkExact: vi.fn(), changeExact: vi.fn(), platform: 'android',
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => mocks.platform },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: mocks.permissions, getPending: mocks.pending,
    cancel: mocks.cancel, schedule: mocks.schedule,
    checkExactNotificationSetting: mocks.checkExact,
    changeExactNotificationSetting: mocks.changeExact,
  },
}));
vi.mock('@/lib/sfx', () => ({ playSirenLoop: vi.fn() }));

import { scheduleHabitReminders, cancelHabitReminders } from '@/lib/habitNotifications';
import {
  getExactAlarmStatus, openExactAlarmSettings, EXACT_ALARM_CHANGED_EVENT,
} from '@/lib/exactAlarms';

const habit: DbHabit = {
  id: 'h1', user_id: 'u', name: 'Read', emoji: '📚', color: 'blue', frequency: 'daily',
  category: 'wellness', difficulty: 'easy', reminder_time: '09:00', reminder_enabled: true,
  reminder_tone: 'normal', sound_mode: 'normal', custom_days: [], completions: [],
  created_at: '2026-09-01T00:00:00Z',
} as DbHabit;

type N = { isExactNotification?: boolean };
const lastBatch = () => mocks.schedule.mock.calls.at(-1)?.[0].notifications as N[];

describe('exact alarms for habit reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform = 'android';
    mocks.permissions.mockResolvedValue({ display: 'granted' });
    mocks.pending.mockResolvedValue({ notifications: [] });
    mocks.schedule.mockResolvedValue({ notifications: [] });
  });
  afterEach(async () => {
    cancelHabitReminders();
    await Promise.resolve(); await Promise.resolve();
  });

  it('schedules inexact (no auto-opened settings screen) when exact alarms are off', async () => {
    mocks.checkExact.mockResolvedValue({ exact_alarm: 'denied' });
    scheduleHabitReminders([habit]);
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    expect(lastBatch().length).toBeGreaterThan(0);
    expect(lastBatch().every(n => n.isExactNotification === false)).toBe(true);
    expect(mocks.changeExact).not.toHaveBeenCalled();
  });

  it('schedules exact once the user allows Alarms & reminders', async () => {
    mocks.checkExact.mockResolvedValue({ exact_alarm: 'granted' });
    scheduleHabitReminders([habit]);
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    expect(lastBatch().every(n => n.isExactNotification === true)).toBe(true);
  });

  it('still schedules (inexact) when the exact-alarm check itself fails', async () => {
    mocks.checkExact.mockRejectedValue(new Error('boom'));
    scheduleHabitReminders([habit]);
    await vi.waitFor(() => expect(mocks.schedule).toHaveBeenCalledTimes(1));
    expect(lastBatch().every(n => n.isExactNotification === false)).toBe(true);
  });

  it('reports unsupported and never calls the plugin on iOS', async () => {
    mocks.platform = 'ios';
    expect(await getExactAlarmStatus()).toBe('unsupported');
    expect(await openExactAlarmSettings()).toBe('unsupported');
    expect(mocks.checkExact).not.toHaveBeenCalled();
    expect(mocks.changeExact).not.toHaveBeenCalled();
  });

  it('opens the settings screen, returns the new state and tells the scheduler', async () => {
    mocks.changeExact.mockResolvedValue({ exact_alarm: 'granted' });
    const heard = vi.fn();
    window.addEventListener(EXACT_ALARM_CHANGED_EVENT, heard);
    expect(await openExactAlarmSettings()).toBe('granted');
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(EXACT_ALARM_CHANGED_EVENT, heard);
  });

  it('never throws when the settings screen cannot open', async () => {
    mocks.changeExact.mockRejectedValue(new Error('no activity'));
    mocks.checkExact.mockResolvedValue({ exact_alarm: 'denied' });
    await expect(openExactAlarmSettings()).resolves.toBe('denied');
  });

  it('declares SCHEDULE_EXACT_ALARM, never removes it, and never uses USE_EXACT_ALARM', () => {
    const manifest = readFileSync(
      resolve(__dirname, '../../../android/app/src/main/AndroidManifest.xml'), 'utf8');
    const tags: string[] = manifest.match(/<uses-permission[^>]*>/g) ?? [];
    const exact = tags.filter(t => t.includes('android.permission.SCHEDULE_EXACT_ALARM'));
    expect(exact).toHaveLength(1);
    expect(exact[0]).not.toContain('tools:node');
    expect(tags.some(t => t.includes('USE_EXACT_ALARM') && !t.includes('SCHEDULE_'))).toBe(false);
  });
});
