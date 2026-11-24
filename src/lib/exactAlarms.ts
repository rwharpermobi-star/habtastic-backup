// Android 12+ "Alarms & reminders" (SCHEDULE_EXACT_ALARM) special access.
//
// Habit reminders work without it: they fall back to inexact alarms that
// Android may deliver a little late. When the user allows it, reminders fire
// on the minute. Every call here is safe on web/iOS and never throws.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type ExactAlarmStatus = 'granted' | 'denied' | 'unsupported';

/** Fired after the user returns from the Alarms & reminders screen. */
export const EXACT_ALARM_CHANGED_EVENT = 'habtastic:exact-alarm-changed';

function isAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function normalize(value: unknown): ExactAlarmStatus {
  return value === 'granted' ? 'granted' : 'denied';
}

/**
 * Whether exact alarms are allowed. 'unsupported' off Android (nothing to
 * ask for). Android below 12 reports 'granted' from the plugin.
 */
export async function getExactAlarmStatus(): Promise<ExactAlarmStatus> {
  if (!isAndroidApp()) return 'unsupported';
  try {
    const res = await LocalNotifications.checkExactNotificationSetting();
    return normalize(res?.exact_alarm);
  } catch (e) {
    console.warn('[exactAlarms] check failed', e);
    return 'denied';
  }
}

/**
 * Opens the system "Alarms & reminders" screen for HabTastic and resolves
 * with the setting once the user comes back. Never throws.
 */
export async function openExactAlarmSettings(): Promise<ExactAlarmStatus> {
  if (!isAndroidApp()) return 'unsupported';
  let status: ExactAlarmStatus = 'denied';
  try {
    const res = await LocalNotifications.changeExactNotificationSetting();
    status = normalize(res?.exact_alarm);
  } catch (e) {
    console.warn('[exactAlarms] open settings failed', e);
    status = await getExactAlarmStatus();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXACT_ALARM_CHANGED_EVENT, { detail: status }));
  }
  return status;
}
