/**
 * Backend reachability monitor.
 *
 * Every Supabase request reports its outcome here (see the fetch wrapper in
 * `src/integrations/supabase/client.ts`). A single network failure never shows
 * UI on its own: it triggers a lightweight health probe, and only a failed
 * probe marks the backend as unreachable. While unreachable the monitor keeps
 * retrying with backoff, retries immediately when the device comes back
 * online or the app returns to the foreground, and notifies listeners once a
 * probe or any real request succeeds again.
 */

export type BackendStatus = 'ok' | 'unreachable';

export interface BackendHealthSnapshot {
  status: BackendStatus;
  /** A probe is in flight. */
  checking: boolean;
  /** Epoch ms of the next automatic retry while unreachable. */
  nextRetryAt: number | null;
  /** Consecutive failed probes. */
  failures: number;
}

export interface BackendHealthOptions {
  healthUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** Backoff schedule in ms; the last value repeats. */
  retryDelaysMs?: number[];
  isDeviceOffline?: () => boolean;
}

export const DEFAULT_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000];
export const DEFAULT_PROBE_TIMEOUT_MS = 6_000;
/** Gateway/outage statuses that mean the backend itself is down. */
const OUTAGE_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

export function isOutageStatus(status: number): boolean {
  return OUTAGE_STATUSES.has(status);
}

export function createBackendHealthMonitor(options: BackendHealthOptions) {
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const delays = options.retryDelaysMs?.length ? options.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
  const isDeviceOffline =
    options.isDeviceOffline ?? (() => typeof navigator !== 'undefined' && navigator.onLine === false);

  let snapshot: BackendHealthSnapshot = { status: 'ok', checking: false, nextRetryAt: null, failures: 0 };
  let inflight: Promise<boolean> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const recoveredListeners = new Set<() => void>();

  const set = (patch: Partial<BackendHealthSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  };

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const markOk = () => {
    clearRetry();
    if (snapshot.status === 'ok' && snapshot.failures === 0 && snapshot.nextRetryAt === null) return;
    const recovered = snapshot.status === 'unreachable';
    set({ status: 'ok', failures: 0, nextRetryAt: null });
    if (recovered) recoveredListeners.forEach((l) => l());
  };

  const markUnreachable = () => {
    const failures = snapshot.failures + 1;
    const delay = delays[Math.min(failures - 1, delays.length - 1)];
    clearRetry();
    retryTimer = setTimeout(() => { retryTimer = null; void checkNow(); }, delay);
    set({ status: 'unreachable', failures, nextRetryAt: now() + delay });
  };

  async function probe(): Promise<boolean> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const res = await fetchImpl(options.healthUrl, {
        method: 'GET',
        headers: { apikey: options.apiKey },
        cache: 'no-store',
        signal: controller?.signal,
      });
      // Any non-outage HTTP answer means the backend is reachable.
      return !isOutageStatus(res.status);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Probe the backend now. Concurrent calls share one probe. */
  function checkNow(): Promise<boolean> {
    if (inflight) return inflight;
    set({ checking: true });
    inflight = probe().then((ok) => {
      inflight = null;
      snapshot = { ...snapshot, checking: false };
      if (ok) markOk();
      // Offline devices are covered by the offline banner; just keep retrying quietly.
      else markUnreachable();
      listeners.forEach((l) => l());
      return ok;
    });
    return inflight;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    onRecovered(listener: () => void) {
      recoveredListeners.add(listener);
      return () => { recoveredListeners.delete(listener); };
    },
    checkNow,
    /** A real request got an HTTP answer from the backend. */
    reportSuccess() {
      if (snapshot.status === 'unreachable') markOk();
    },
    /** A real request failed at the network level or with an outage status. */
    reportFailure() {
      if (isDeviceOffline()) return;
      if (snapshot.status === 'unreachable') return; // already retrying on a schedule
      void checkNow();
    },
    /** Device connectivity or app focus returned: retry immediately if down. */
    handleResume() {
      if (snapshot.status === 'unreachable') void checkNow();
    },
    /** Test helper. */
    dispose() {
      clearRetry();
      listeners.clear();
      recoveredListeners.clear();
    },
  };
}

export type BackendHealthMonitor = ReturnType<typeof createBackendHealthMonitor>;

/** True for errors thrown by fetch itself (DNS, refused, TLS, timeout), not aborts. */
export function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name !== 'AbortError';
}
