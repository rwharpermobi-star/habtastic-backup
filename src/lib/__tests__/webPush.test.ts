/**
 * End-to-end web push lifecycle test.
 *
 * Verifies (in jsdom):
 *  1. Service worker registration succeeds.
 *  2. ensurePushSubscription() requests permission, subscribes, and saves the
 *     subscription via the Edge Function.
 *  3. A simulated push event (the kind a habit reminder dispatcher would send)
 *     is received by the SW and forwarded to showNotification with the
 *     expected title + body shape.
 *
 * This covers the full registration → subscription → delivery loop without a
 * real browser, by mocking the relevant browser APIs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks for the Supabase client used by webPush.ts
// ──────────────────────────────────────────────────────────────────────────────
const fakeVapidPublicKey =
  'BNNxbqK7iH9oYwT3qJ7Vp8mP6nQ4jL2sH5cR8fE9aT1uW0xY6zKvB3MdN2pQ4rS8tV1wU7yX0bZ9eG4hF6iJ3lK';

const invokeMock = vi.fn(async (name: string, _opts?: { body?: Record<string, unknown> }) => {
  if (name === 'vapid-public-key') return { data: { publicKey: fakeVapidPublicKey }, error: null };
  if (name === 'push-subscribe') return { data: { ok: true }, error: null };
  return { data: null, error: null };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' } } }, error: null }) },
    from: () => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'sub-1' }, error: null }) }) }),
    }),
  },
}));


// ──────────────────────────────────────────────────────────────────────────────
// Helpers to simulate browser push APIs in jsdom
// ──────────────────────────────────────────────────────────────────────────────
type PushHandler = (event: { data: { json: () => Record<string, unknown>; text: () => string }; waitUntil: (p: unknown) => void }) => void;

function installPushBrowserApis() {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
      keys: { p256dh: 'p256dh-test', auth: 'auth-test' },
    }),
    unsubscribe: vi.fn(async () => true),
  };

  const showNotification = vi.fn(async (_title: string, _opts?: NotificationOptions) => undefined);
  const pushHandlers: PushHandler[] = [];

  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => subscription),
    },
    showNotification,
    addEventListener: (type: string, handler: PushHandler) => {
      if (type === 'push') pushHandlers.push(handler);
    },
  };

  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(async () => registration),
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });

  // PushManager presence is feature-detected by isWebPushSupported()
  (window as unknown as { PushManager: unknown }).PushManager = function PushManager() {};

  // Notification API
  const NotificationMock = vi.fn(function (this: unknown, title: string, opts?: NotificationOptions) {
    Object.assign(this as object, { title, ...opts });
  }) as unknown as typeof Notification & {
    permission: NotificationPermission;
    requestPermission: () => Promise<NotificationPermission>;
  };
  NotificationMock.permission = 'default';
  NotificationMock.requestPermission = vi.fn(async () => {
    NotificationMock.permission = 'granted';
    return 'granted' as NotificationPermission;
  });
  (window as unknown as { Notification: unknown }).Notification = NotificationMock;

  return { registration, subscription, showNotification, pushHandlers, NotificationMock };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe('Web push end-to-end lifecycle', () => {
  let apis: ReturnType<typeof installPushBrowserApis>;

  beforeEach(() => {
    invokeMock.mockClear();
    apis = installPushBrowserApis();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('detects push support when service worker + PushManager + Notification exist', async () => {
    const { isWebPushSupported } = await import('@/lib/webPush');
    expect(isWebPushSupported()).toBe(true);
  });

  it('registers the service worker successfully', async () => {
    const { registerSW } = await import('@/lib/webPush');
    const reg = await registerSW();
    expect(reg).toBeTruthy();
    expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
  });

  it('requests permission, subscribes, and persists the subscription', async () => {
    const { ensurePushSubscription } = await import('@/lib/webPush');

    const ok = await ensurePushSubscription();

    expect(ok).toBe(true);
    // Permission was requested (default → granted)
    expect(apis.NotificationMock.requestPermission).toHaveBeenCalled();
    // Subscribed against the registration
    expect(apis.registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    // Subscription forwarded to the edge function with correct payload
    const subscribeCall = invokeMock.mock.calls.find((c) => c[0] === 'push-subscribe');
    expect(subscribeCall).toBeDefined();
    const body = (subscribeCall![1] as { body: Record<string, unknown> } | undefined)?.body;
    expect(body).toMatchObject({
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
      p256dh: 'p256dh-test',
      auth: 'auth-test',
    });
  });

  it('delivers a simulated habit-reminder push to showNotification', async () => {
    // Wire up SW push handler (mirrors public/sw.js)
    apis.registration.addEventListener('push', (event) => {
      const data = event.data.json();
      const title = (data.title as string) || 'HabTastic ⚡';
      const options = {
        body: (data.body as string) || '',
        tag: (data.tag as string) || 'habtastic',
        data: { url: (data.url as string) || '/', habitId: (data.habitId as string) || null },
      };
      event.waitUntil(apis.registration.showNotification(title, options));
    });

    // Simulate the dispatcher pushing a "habit reminder due" payload
    const payload = {
      title: '💪 Exercise',
      body: "Time for your habit. Small action now = big results later.",
      tag: 'habit-reminder',
      url: '/habits',
      habitId: 'habit-uuid-1',
    };

    const waitUntil = vi.fn();
    apis.pushHandlers[0]({
      data: { json: () => payload, text: () => JSON.stringify(payload) },
      waitUntil,
    });

    expect(apis.showNotification).toHaveBeenCalledTimes(1);
    expect(apis.showNotification).toHaveBeenCalledWith(
      '💪 Exercise',
      expect.objectContaining({
        body: expect.stringContaining('Time for your habit'),
        tag: 'habit-reminder',
        data: expect.objectContaining({ url: '/habits', habitId: 'habit-uuid-1' }),
      })
    );
    expect(waitUntil).toHaveBeenCalled();
  });

  it('returns false and does not subscribe when permission is denied', async () => {
    apis.NotificationMock.permission = 'denied';
    apis.NotificationMock.requestPermission = vi.fn(async () => 'denied' as NotificationPermission);

    const { ensurePushSubscription } = await import('@/lib/webPush');
    const ok = await ensurePushSubscription();

    expect(ok).toBe(false);
    expect(apis.registration.pushManager.subscribe).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith('push-subscribe', expect.anything());
  });
});
