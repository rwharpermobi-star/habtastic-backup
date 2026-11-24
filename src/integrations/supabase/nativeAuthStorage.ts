/**
 * Supabase auth storage backed by Capacitor Preferences (Android
 * SharedPreferences / iOS UserDefaults).
 *
 * Native storage is durable across WebView cleanup, while localStorage is kept
 * as a recovery mirror for older installs and interrupted writes. Because
 * Supabase rotates refresh tokens, the two copies must never race: using an
 * older copy can make the next refresh fail with "Refresh token is not valid".
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const PREFIX = 'supabase.auth.';

/** True only inside a real native Capacitor shell (Android/iOS). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function localGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* native store remains available */
  }
}

function localRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Supabase stores the session JSON under sb-<project>-auth-token. A refreshed
 * session has a later expires_at, so it is a reliable signal for which mirrored
 * copy is newer after an interrupted/partial write.
 */
function sessionExpiresAt(raw: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { expires_at?: unknown };
    return typeof parsed.expires_at === 'number' && Number.isFinite(parsed.expires_at)
      ? parsed.expires_at
      : 0;
  } catch {
    return 0;
  }
}

function pickFreshest(nativeValue: string | null, localValue: string | null): string | null {
  if (nativeValue === localValue) return nativeValue;
  if (!nativeValue) return localValue;
  if (!localValue) return nativeValue;

  const nativeExpiry = sessionExpiresAt(nativeValue);
  const localExpiry = sessionExpiresAt(localValue);
  if (nativeExpiry && localExpiry && nativeExpiry !== localExpiry) {
    return localExpiry > nativeExpiry ? localValue : nativeValue;
  }

  // If neither value exposes a comparable expiry, keep the durable native copy.
  return nativeValue;
}

export function nativeAuthStorage() {
  // Keep the in-process cache and write queue scoped to this adapter instance.
  // Supabase reuses one adapter for a client, so token-rotation reads/writes stay
  // serialized. A recreated client/app gets a fresh adapter and re-reads durable
  // storage instead of inheriting stale in-memory state from a previous adapter.
  const latestValues = new Map<string, string | null>();
  const writeChains = new Map<string, Promise<void>>();

  function enqueueNativeWrite(key: string, operation: () => Promise<void>): Promise<void> {
    const previous = writeChains.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    writeChains.set(key, next);
    void next
      .finally(() => {
        if (writeChains.get(key) === next) writeChains.delete(key);
      })
      .catch(() => undefined);
    return next;
  }

  return {
    getItem: async (key: string): Promise<string | null> => {
      if (latestValues.has(key)) return latestValues.get(key) ?? null;

      const pending = writeChains.get(key);
      if (pending) await pending.catch(() => undefined);
      if (latestValues.has(key)) return latestValues.get(key) ?? null;

      try {
        const [{ value: nativeValue }, localValue] = await Promise.all([
          Preferences.get({ key: PREFIX + key }),
          Promise.resolve(localGet(key)),
        ]);

        const chosen = pickFreshest(typeof nativeValue === 'string' ? nativeValue : null, localValue);
        latestValues.set(key, chosen);

        // Self-heal both mirrors so future reads cannot resurrect a rotated token.
        if (chosen != null) {
          if (localValue !== chosen) localSet(key, chosen);
          if (nativeValue !== chosen) {
            await enqueueNativeWrite(key, () => Preferences.set({ key: PREFIX + key, value: chosen }));
          }
        }
        return chosen;
      } catch (err) {
        console.warn('[auth-storage] native get failed, using localStorage', err);
        const fallback = localGet(key);
        latestValues.set(key, fallback);
        return fallback;
      }
    },

    setItem: async (key: string, value: string): Promise<void> => {
      // Make the rotated token authoritative immediately, then persist both
      // mirrors. A concurrent getItem on this adapter cannot observe the old token.
      latestValues.set(key, value);
      localSet(key, value);
      try {
        await enqueueNativeWrite(key, () => Preferences.set({ key: PREFIX + key, value }));
      } catch (err) {
        console.warn('[auth-storage] native set failed, kept localStorage copy', err);
      }
    },

    removeItem: async (key: string): Promise<void> => {
      latestValues.set(key, null);
      localRemove(key);
      try {
        await enqueueNativeWrite(key, () => Preferences.remove({ key: PREFIX + key }));
      } catch (err) {
        console.warn('[auth-storage] native remove failed', err);
      }
    },
  };
}
