// Single source of truth for notification permission state across web and
// Capacitor (Android/iOS). The old code read `Notification.permission` even
// inside the Android WebView, where that API is often 'denied'/absent even
// though the OS-level POST_NOTIFICATIONS permission is granted — which is why
// the app wrongly claimed "your browser is blocking notifications".
import { Capacitor } from '@capacitor/core';

export type UnifiedPermission = 'granted' | 'denied' | 'default';

export interface PermissionSnapshot {
  /** Unified state to drive UI. Only 'denied' should ever show a warning. */
  state: UnifiedPermission;
  /** Raw web value, or null when the Notification API is unavailable. */
  web: NotificationPermission | null;
  /** Raw Capacitor value, or null on web / when the plugin is unavailable. */
  native: string | null;
  platform: string;
  isNative: boolean;
}

const log = (...args: unknown[]) => console.log('[notifPerm]', ...args);

function webPermission(): NotificationPermission | null {
  if (typeof Notification === 'undefined') return null;
  try { return Notification.permission; } catch { return null; }
}

async function nativePermission(): Promise<string | null> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const p = await PushNotifications.checkPermissions();
    return p.receive;
  } catch (e) {
    console.warn('[notifPerm] checkPermissions failed', e);
    return null;
  }
}

function normalizeNative(receive: string | null): UnifiedPermission {
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'default'; // 'prompt' | 'prompt-with-rationale' | null
}

/** Reads the real permission state for the current platform. */
export async function getNotificationPermission(): Promise<PermissionSnapshot> {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const web = webPermission();

  if (isNative) {
    const native = await nativePermission();
    const state = normalizeNative(native);
    log('snapshot', { platform, isNative, native, web, state });
    return { state, web, native, platform, isNative };
  }

  // Web: no Notification API at all → treat as default (unsupported), never denied.
  const state: UnifiedPermission = web ?? 'default';
  log('snapshot', { platform, isNative, native: null, web, state });
  return { state, web, native: null, platform, isNative };
}

/** Fired after the user grants notifications in-app so native push setup restarts. */
export const NOTIFICATION_GRANTED_EVENT = 'habtastic:notification-permission-granted';

export function announceNotificationGranted(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATION_GRANTED_EVENT));
}

/**
 * Requests permission when it is still 'default'. Returns the resulting
 * snapshot. Never requests when already granted or denied.
 */
export async function requestNotificationPermission(): Promise<PermissionSnapshot> {
  const before = await getNotificationPermission();
  if (before.state !== 'default') {
    log('request skipped — already', before.state);
    return before;
  }

  if (before.isNative) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const p = await PushNotifications.requestPermissions();
      log('native requestPermissions →', p.receive);
    } catch (e) {
      console.error('[notifPerm] native requestPermissions failed', e);
    }
  } else if (typeof Notification !== 'undefined') {
    try {
      const r = await Notification.requestPermission();
      log('web requestPermission →', r);
    } catch (e) {
      console.error('[notifPerm] web requestPermission failed', e);
    }
  }

  const after = await getNotificationPermission();
  if (after.state === 'granted') announceNotificationGranted();
  return after;
}
