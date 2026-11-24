import { getSupabase } from '@/integrations/supabase/lazyClient';

let cachedKey: string | null = null;

async function getVapidPublicKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    const { data, error } = await (await getSupabase()).functions.invoke('vapid-public-key');
    if (error || !data?.publicKey) return null;
    cachedKey = data.publicKey;
    return cachedKey;
  } catch { return null; }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isWebPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

const wlog = (...args: unknown[]) => console.log('[webPush]', ...args);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Human-readable reason the last registration attempt failed. Surfaced in the
 * UI so users (and we) stop guessing why "no token on file" is shown.
 */
export let lastPushFailure: string | null = null;
const fail = (reason: string) => { lastPushFailure = reason; console.error('[webPush] ✖', reason); return false; };


/** Confirms the endpoint really exists in push_subscriptions for this user. */
async function verifySubscriptionSaved(endpoint: string): Promise<boolean> {
  const { data, error } = await (await getSupabase())
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (error) { console.warn('[webPush] verify query failed', error.message); return false; }
  const ok = Boolean(data?.id);
  wlog(ok ? '✔ subscription row confirmed in push_subscriptions' : '✖ subscription row NOT found');
  return ok;
}

export async function ensurePushSubscription(): Promise<boolean> {
  lastPushFailure = null;
  if (!isWebPushSupported()) return fail('This browser does not support web push.');

  try {
    const { data } = await (await getSupabase()).auth.getSession();
    wlog('session present =', Boolean(data?.session?.user), data?.session?.user?.id ?? '');
    if (data && !data.session?.user) return fail('You must be signed in to register for push.');
  } catch (e) {
    console.warn('[webPush] could not read session', e);
  }


  const publicKey = await getVapidPublicKey();
  if (!publicKey) return fail('Server VAPID public key is unavailable.');
  wlog('VAPID key length =', publicKey.length);

  const reg = await registerSW();
  if (!reg) return fail('Service worker registration failed (/sw.js).');
  wlog('✔ service worker registered, scope =', reg.scope);

  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  wlog('permission =', perm);
  if (perm !== 'granted') return fail(`Notification permission is "${perm}".`);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      wlog('✔ new browser push subscription created');
    } catch (e) {
      return fail(`Browser refused to create a push subscription: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    wlog('✔ existing browser push subscription found');
  }

  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  wlog('endpoint host =', (() => { try { return new URL(json.endpoint).host; } catch { return '?'; } })());

  // Throttle the upsert to once per 24h per endpoint to avoid write
  // amplification — but only when the row is actually still on the server.
  // (A backend rebuild wipes push_subscriptions while this cache survives,
  // which used to leave the user permanently "not subscribed".)
  const THROTTLE_MS = 24 * 60 * 60 * 1000;
  const cacheKey = `habtastic-push-upsert:${json.endpoint}`;
  let cachedRecently = false;
  try {
    const last = Number(localStorage.getItem(cacheKey) || 0);
    cachedRecently = Boolean(last && Date.now() - last < THROTTLE_MS);
  } catch { /* storage disabled */ }
  if (cachedRecently && await verifySubscriptionSaved(json.endpoint)) {
    wlog('subscription already registered recently — nothing to do');
    return true;
  }

  const MAX_ATTEMPTS = 3;
  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    wlog(`uploading subscription to push-subscribe (attempt ${attempt}/${MAX_ATTEMPTS})…`);
    const { data, error } = await (await getSupabase()).functions.invoke('push-subscribe', {
      body: {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
    });
    if (!error) {
      wlog('push-subscribe response', data);
      if (await verifySubscriptionSaved(json.endpoint)) {
        try { localStorage.setItem(cacheKey, String(Date.now())); } catch { /* noop */ }
        wlog('✔ subscription registered');
        return true;
      }
      lastError = 'server accepted the subscription but no row was saved';
      console.error('[webPush] ✖', lastError);
    } else {
      lastError = error.message ?? String(error);
      console.error(`[webPush] ✖ subscription upload failed (attempt ${attempt})`, lastError);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(2000 * attempt);
  }
  try { localStorage.removeItem(cacheKey); } catch { /* noop */ }
  return fail(`Could not save the subscription: ${lastError}`);
}

/**
 * Registers for push and, if it failed, retries a few times with backoff.
 * Used on app start / sign-in so a transient failure doesn't leave the user
 * permanently without a push subscription.
 */
export async function ensurePushSubscriptionWithRetry(attempts = 3): Promise<boolean> {
  for (let i = 1; i <= attempts; i++) {
    if (await ensurePushSubscription()) return true;
    // Nothing to retry when the browser/user blocks us.
    if (lastPushFailure && /permission|does not support|signed in/i.test(lastPushFailure)) return false;
    if (i < attempts) await sleep(5000 * i);
  }
  return false;
}



export async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    // Server-authoritative removal: client table writes are intentionally
    // disabled so a browser cannot alter another account's subscription row.
    try {
      await (await getSupabase()).functions.invoke('push-subscribe', {
        body: { endpoint: sub.endpoint, unregister: true },
      });
    } finally {
      await sub.unsubscribe();
    }
  }
}

/**
 * Ensures push is enabled, then invokes send-test-push with a preview reminder
 * for the given habit. Shared by AddHabitDialog and EditReminderSheet so both
 * flows behave identically. Returns true on delivered success, false on no
 * devices subscribed, and throws on unexpected errors so callers can log.
 */
export async function sendHabitTestPush(habitName: string, habitEmoji: string): Promise<{ ok: boolean; message?: string; needsPermission?: boolean }> {
  const enabled = await ensurePushSubscription();
  if (!enabled) return { ok: false, needsPermission: true };
  const { data, error } = await (await getSupabase()).functions.invoke('send-test-push', {
    body: {
      title: `Time for: ${habitName} ${habitEmoji}`,
      body: 'This is what your reminder will look like. Tap to complete it.',
    },
  });
  if (error) throw error;
  if (data?.ok === false) return { ok: false, message: data?.message };
  return { ok: true };
}
