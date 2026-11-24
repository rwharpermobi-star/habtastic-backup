import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory native store that intentionally OUTLIVES adapter instances — this
// is what simulates the Android app being fully closed and relaunched.
const nativeStore = new Map<string, string>();
let failNative = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => {
      if (failNative) throw new Error('plugin unavailable');
      return { value: nativeStore.has(key) ? nativeStore.get(key)! : null };
    },
    set: async ({ key, value }: { key: string; value: string }) => {
      if (failNative) throw new Error('plugin unavailable');
      nativeStore.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      if (failNative) throw new Error('plugin unavailable');
      nativeStore.delete(key);
    },
  },
}));

import { isNativeApp, nativeAuthStorage } from '../nativeAuthStorage';

const KEY = 'sb-votldorvfuktonwewuhm-auth-token';
const SESSION = JSON.stringify({ access_token: 'abc', refresh_token: 'def' });

beforeEach(() => {
  nativeStore.clear();
  localStorage.clear();
  failNative = false;
});

describe('nativeAuthStorage', () => {
  it('detects the native platform', () => {
    expect(isNativeApp()).toBe(true);
  });

  it('persists a saved session across client/app recreation', async () => {
    await nativeAuthStorage().setItem(KEY, SESSION);

    // Fresh adapter == fresh Supabase client after app relaunch.
    const restored = await nativeAuthStorage().getItem(KEY);
    expect(restored).toBe(SESSION);
  });

  it('keeps the session even when the WebView localStorage is wiped', async () => {
    await nativeAuthStorage().setItem(KEY, SESSION);
    localStorage.clear(); // OS cleared WebView storage

    expect(await nativeAuthStorage().getItem(KEY)).toBe(SESSION);
  });

  it('removeItem clears the session for future instances', async () => {
    const storage = nativeAuthStorage();
    await storage.setItem(KEY, SESSION);
    await storage.removeItem(KEY);

    expect(await nativeAuthStorage().getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('migrates a legacy localStorage session into native storage', async () => {
    localStorage.setItem(KEY, SESSION);

    expect(await nativeAuthStorage().getItem(KEY)).toBe(SESSION);
    expect(nativeStore.get(`supabase.auth.${KEY}`)).toBe(SESSION);

    localStorage.clear();
    expect(await nativeAuthStorage().getItem(KEY)).toBe(SESSION);
  });

  it('keeps the newest rotated session and repairs the stale native mirror', async () => {
    const oldSession = JSON.stringify({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      expires_at: 100,
    });
    const newSession = JSON.stringify({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: 200,
    });

    nativeStore.set(`supabase.auth.${KEY}`, oldSession);
    localStorage.setItem(KEY, newSession);

    expect(await nativeAuthStorage().getItem(KEY)).toBe(newSession);
    expect(nativeStore.get(`supabase.auth.${KEY}`)).toBe(newSession);
    expect(localStorage.getItem(KEY)).toBe(newSession);
  });

  it('falls back to localStorage when the native plugin throws', async () => {
    failNative = true;
    await nativeAuthStorage().setItem(KEY, SESSION);

    await expect(nativeAuthStorage().getItem(KEY)).resolves.toBe(SESSION);
  });

  it('returns null for an unknown key', async () => {
    expect(await nativeAuthStorage().getItem('missing')).toBeNull();
  });
});
