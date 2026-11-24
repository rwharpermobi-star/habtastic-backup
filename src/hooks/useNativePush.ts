// Registers the device for FCM (Android) / APNs (iOS) push notifications
// and persists the resulting token in `device_tokens`.
// No-op on web (web push is handled by src/lib/webPush.ts).
//
// Design notes (why it looks like this):
//  * The token is requested as soon as the app launches, even when signed out,
//    so it already exists by the time a user logs in.
//  * Saving always goes through the authenticated `push-token-register`
//    edge function. Client-side writes to `device_tokens` are intentionally
//    disabled so a token can never be reassigned across accounts.
//  * Every stage writes a localStorage breadcrumb that /fcm-debug renders.
import { useEffect, useRef, useState } from 'react';
import { NOTIFICATION_GRANTED_EVENT } from '@/lib/notificationPermission';
import { Capacitor } from '@capacitor/core';
import { getSupabase } from '@/integrations/supabase/lazyClient';
import { useAuth } from '@/contexts/AuthContext';

interface PushRegistrationEvent { value: string }
interface PushActionPerformed {
  notification: { data?: Record<string, unknown> };
}

const APP_VERSION = `${Capacitor.getPlatform()}-1.0.0`;

/** Must match `default_notification_channel_id` in AndroidManifest.xml. */
export const ANDROID_CHANNEL_ID = 'habtastic_default';

// Breadcrumb keys read by src/pages/FCMDebug.tsx.
const LS = {
  lastRegAt: 'fcm.lastRegistrationAt',
  lastToken: 'fcm.lastToken',
  lastErrorAt: 'fcm.lastErrorAt',
  lastErrorCode: 'fcm.lastErrorCode',
  lastSavedAt: 'fcm.lastSavedAt',
  lastReceivedAt: 'fcm.lastReceivedAt',
  permission: 'fcm.permission',
} as const;

const remember = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
};
const forget = (key: string) => {
  try { localStorage.removeItem(key); } catch { /* noop */ }
};

// Verbose, greppable logs so `adb logcat | grep nativePush` tells the whole story.
const log = (...args: unknown[]) => console.log('[nativePush]', ...args);
const maskToken = (t: string) =>
  t.length > 16 ? `${t.slice(0, 8)}…${t.slice(-6)} (len=${t.length})` : `(len=${t.length})`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Confirms the token actually landed in device_tokens for this user. */
async function verifyTokenSaved(token: string): Promise<boolean> {
  const { data, error } = await (await getSupabase())
    .from('device_tokens')
    .select('id,user_id')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    console.warn('[nativePush] verify query failed', error.message);
    return false;
  }
  const ok = Boolean(data?.id);
  log(ok ? '✔ verified token row exists in device_tokens' : '✖ token row NOT found in device_tokens');
  return ok;
}

/**
 * Uploads the token and retries with backoff. Returns true only when the row
 * is confirmed present in device_tokens, so a silent failure can't look like
 * a success ("No token on file" in the setup checklist).
 */
async function registerToken(token: string, attempt = 1): Promise<boolean> {
  const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
  if (platform === 'web') return false;
  const MAX_ATTEMPTS = 4;
  log(`4/5 saving FCM token to Supabase (attempt ${attempt}/${MAX_ATTEMPTS})…`, maskToken(token));
  try {
    const { data, error } = await (await getSupabase()).functions.invoke('push-token-register', {
      body: { token, platform, app_version: APP_VERSION },
    });
    if (error) {
      const status = (error)?.context?.status;
      const response = (error)?.context;
      let serverCode = "";
      try {
        if (response && typeof response.json === "function") {
          const body = await response.clone().json();
          serverCode = typeof body?.error === "string" ? body.error : "";
        }
      } catch { /* response body may already be consumed */ }
      console.error(`[nativePush] ✖ token upload FAILED (attempt ${attempt})`, { status, serverCode, message: error.message ?? String(error) });
      if (status === 409 || serverCode === "token_conflict") {
        remember(LS.lastErrorAt, new Date().toISOString());
        remember(LS.lastErrorCode, "token_conflict");
        console.warn("[nativePush] token belongs to another account; stopping retries to avoid a registration loop");
        return false;
      }
    } else {
      log('✔ 4/5 push-token-register responded', data);
      if (await verifyTokenSaved(token)) {
        remember(LS.lastSavedAt, new Date().toISOString());
        return true;
      }
    }
  } catch (e) {
    console.error(`[nativePush] ✖ token upload threw (attempt ${attempt})`, e);
  }

  if (attempt >= MAX_ATTEMPTS) {
    console.error('[nativePush] ✖ giving up on token upload after', MAX_ATTEMPTS, 'attempts');
    return false;
  }
  const delay = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s
  log(`retrying token upload in ${delay}ms…`);
  await sleep(delay);
  return registerToken(token, attempt + 1);
}

async function unregisterToken(token: string) {
  const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
  if (platform === 'web') return;
  try {
    await (await getSupabase()).functions.invoke('push-token-register', {
      body: { token, platform, unregister: true },
    });
    log('token unregistered on sign-out', maskToken(token));
  } catch (e) {
    console.warn('[nativePush] token unregister failed', e);
  }
}

/**
 * Android 8+ requires an explicit channel for heads-up notifications to show
 * while the app is backgrounded or closed. FCM's implicit fallback channel is
 * silent on several OEM skins, so we create ours up front.
 */
async function ensureAndroidChannel(PN: typeof import('@capacitor/push-notifications')['PushNotifications']) {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { channels } = await PN.listChannels();
    if (channels.some((c) => c.id === ANDROID_CHANNEL_ID)) {
      log('✔ notification channel already exists', ANDROID_CHANNEL_ID);
      return;
    }
    await PN.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'HabTastic reminders',
      description: 'Habit reminders, streak alerts and coach nudges',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default',
    });
    log('✔ created notification channel', ANDROID_CHANNEL_ID);
  } catch (e) {
    console.warn('[nativePush] channel setup failed (non-fatal)', e);
  }
}

export function useNativePush() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const setupRef = useRef(false);
  const [setupTick, setSetupTick] = useState(0);
  // Restart setup as soon as permission is granted from an in-app screen.
  useEffect(() => {
    const onGranted = () => { setupRef.current = false; setSetupTick((t) => t + 1); };
    window.addEventListener(NOTIFICATION_GRANTED_EVENT, onGranted);
    return () => window.removeEventListener(NOTIFICATION_GRANTED_EVENT, onGranted);
  }, []);
  const currentTokenRef = useRef<string | null>(null);
  const savedForUserRef = useRef<string | null>(null); // `${userId}:${token}`
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  // Uploads the token unless this exact user+token pair is already confirmed.
  const saveIfNeeded = useRef(async (token: string, uid: string | null) => {
    if (!uid) {
      log('token available but no signed-in user yet — will save right after login');
      return;
    }
    const key = `${uid}:${token}`;
    if (savedForUserRef.current === key) {
      log('token already confirmed for this account — skipping re-upload');
      return;
    }
    const ok = await registerToken(token);
    savedForUserRef.current = ok ? key : null;
  });

  // Bootstraps Firebase/FCM once per app launch. Intentionally NOT gated on
  // login: the token must exist before the user signs in.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      log('skipped: not a native platform (web uses webPush)');
      return;
    }
    if (setupRef.current) return;
    setupRef.current = true;

    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      try {
        log('1/5 Firebase/Capacitor push bridge initialising, platform =', Capacitor.getPlatform());
        const { PushNotifications } = await import('@capacitor/push-notifications');
        log('✔ 1/5 push plugin loaded (Firebase initialised by google-services.json)');

        await ensureAndroidChannel(PushNotifications);

        // Never prompt on launch (Play policy): only check. The system prompt is
        // shown from the notification screens after we explain why.
        const perm = await PushNotifications.checkPermissions();
        log('2/5 notification permission state =', perm.receive);
        remember(LS.permission, perm.receive);
        if (perm.receive !== 'granted') {
          console.warn('[nativePush] ✖ 2/5 notification permission NOT granted —', perm.receive);
          remember(LS.lastErrorAt, new Date().toISOString());
          remember(LS.lastErrorCode, `permission:${perm.receive}`);
          // Retry on resume: the user may grant it in Android settings.
          const { App: CapApp } = await import('@capacitor/app');
          const lp = await CapApp.addListener('appStateChange', async ({ isActive }) => {
            if (!isActive) return;
            const again = await PushNotifications.checkPermissions();
            if (again.receive !== 'granted') return;
            log('permission granted while away — restarting push setup');
            remember(LS.permission, again.receive);
            void lp.remove();
            setupRef.current = false;
            setSetupTick((t) => t + 1);
          });
          cleanup = () => { void lp.remove(); };
          return;
        }
        log('✔ 2/5 notification permission granted');

        // Listeners must be attached BEFORE register() so the very first
        // `registration` event (which carries the FCM token) is never missed.
        const l1 = await PushNotifications.addListener(
          'registration',
          (e: PushRegistrationEvent) => {
            log('✔ 3/5 FCM token generated/refreshed', maskToken(e.value));
            const rotated = currentTokenRef.current && currentTokenRef.current !== e.value;
            if (rotated) log('token ROTATED — uploading the new one');
            currentTokenRef.current = e.value;
            remember(LS.lastRegAt, new Date().toISOString());
            remember(LS.lastToken, e.value);
            forget(LS.lastErrorCode);
            void saveIfNeeded.current(e.value, userIdRef.current);
          },
        );
        const l2 = await PushNotifications.addListener('registrationError', (err) => {
          console.error('[nativePush] ✖ 3/5 registrationError — no FCM token', err);
          remember(LS.lastErrorAt, new Date().toISOString());
          remember(
            LS.lastErrorCode,
            typeof err === 'object' && err && 'error' in err
              ? String((err as { error: unknown }).error)
              : 'registrationError',
          );
        });
        // Foreground receive: system tray shows notification automatically on
        // Android; bell refreshes via realtime in useNotifications.
        const l3 = await PushNotifications.addListener(
          'pushNotificationReceived',
          (n) => {
            remember(LS.lastReceivedAt, new Date().toISOString());
            log('✔ 5/5 notification received (foreground)', n?.title ?? '', n?.body ?? '');
          },
        );
        // Tap → deep-link (fires for background + cold-start taps)
        const l4 = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (evt: PushActionPerformed) => {
            const url = (evt?.notification?.data?.url as string) || '/';
            remember(LS.lastReceivedAt, new Date().toISOString());
            log('✔ 5/5 notification tapped (background/closed) → navigating to', url);
            try { window.location.assign(url); } catch { /* noop */ }
          },
        );

        if (cancelled) { l1.remove(); l2.remove(); l3.remove(); l4.remove(); return; }

        log('3/5 calling PushNotifications.register()…');
        await PushNotifications.register();

        // Safety net: FCM occasionally never fires `registration` (stale plugin
        // state after an update). Re-register a few times with backoff so the
        // token still reaches Supabase during this session.
        const timers: number[] = [];
        [8000, 20000, 45000].forEach((delay, i) => {
          timers.push(window.setTimeout(() => {
            if (currentTokenRef.current) return;
            console.warn(`[nativePush] no registration event after ${delay}ms — retry ${i + 1} of register()`);
            void PushNotifications.register().catch((e) =>
              console.error('[nativePush] retry register failed', e));
          }, delay));
        });

        // App resume: re-assert the token so a rotation that happened while the
        // app was closed is picked up, and a failed upload gets another chance.
        const { App: CapApp } = await import('@capacitor/app');
        const l5 = await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          log('app resumed — re-asserting push registration');
          void PushNotifications.register().catch(() => {});
          const t = currentTokenRef.current;
          if (t) void saveIfNeeded.current(t, userIdRef.current);
        });

        cleanup = () => {
          timers.forEach((t) => window.clearTimeout(t));
          l1.remove(); l2.remove(); l3.remove(); l4.remove();
          void l5.remove();
        };
      } catch (e) {
        console.error('[nativePush] ✖ setup failed', e);
        remember(LS.lastErrorAt, new Date().toISOString());
        remember(LS.lastErrorCode, e instanceof Error ? e.message : 'setup_failed');
        setupRef.current = false;
      }
    })();

    return () => { cancelled = true; cleanup(); };
  }, [setupTick]);

  // Re-assert the token whenever the user id changes (login / account switch on
  // the same device) so device_tokens always points at the signed-in account.
  useEffect(() => {
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;
    savedForUserRef.current = null;
    const t = currentTokenRef.current ?? (() => {
      try { return localStorage.getItem(LS.lastToken); } catch { return null; }
    })();
    if (!t) {
      log('login detected but no FCM token yet — waiting for registration event');
      return;
    }
    currentTokenRef.current = t;
    void saveIfNeeded.current(t, userId);
  }, [userId]);

  // Detach this device's token when the user signs out so the previous
  // account no longer receives pushes on this device.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (userId) return; // only on sign-out transition
    const t = currentTokenRef.current;
    if (!t) return;
    savedForUserRef.current = null;
    void unregisterToken(t);
  }, [userId]);
}
