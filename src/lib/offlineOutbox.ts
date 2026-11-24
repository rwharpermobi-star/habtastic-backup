/**
 * Offline outbox for habit completion toggles.
 *
 * When the network is unavailable (or a Supabase write fails), we queue the
 * intended completion state to localStorage and replay it as soon as the
 * browser reports the connection is back. The UI updates optimistically in
 * useHabits, so the user can keep marking habits done offline; this module
 * only handles durable persistence + sync.
 */
import { supabase } from '@/integrations/supabase/client';

const OUTBOX_KEY = 'habtastic-offline-outbox-v2';
const LEGACY_OUTBOX_KEY = 'habtastic-offline-outbox-v1';
const CACHE_KEY = (userId: string) => 'habtastic-habits-cache-v1:' + userId;
const SNAPSHOT_WRITE_DELAY_MS = 180;

export interface OutboxEntry {
  userId: string;
  id: string;
  date: string;
  completed: boolean;
  expectedRevision: number;
  eventId: string;
  queuedAt: number;
  /** A server revision conflict is retained for review but never auto-retried. */
  conflicted?: boolean;
}

// A corrupt queue is not empty: never silently overwrite one.
function readOutbox(): OutboxEntry[] | null {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.every((e) =>
      e && typeof e === 'object' && typeof e.userId === 'string' &&
      typeof e.id === 'string' && typeof e.date === 'string' &&
      typeof e.completed === 'boolean' && Number.isSafeInteger(e.expectedRevision) &&
      e.expectedRevision >= 0 && typeof e.eventId === 'string' &&
      typeof e.queuedAt === 'number' &&
      (e.conflicted === undefined || typeof e.conflicted === 'boolean'))) return null;
    return rows as OutboxEntry[];
  } catch { return null; }
}
function writeOutbox(entries: OutboxEntry[]): boolean {
  try {
    const raw = JSON.stringify(entries);
    localStorage.setItem(OUTBOX_KEY, raw);
    return localStorage.getItem(OUTBOX_KEY) === raw;
  } catch (e) {
    console.warn('[offlineOutbox] durable write failed', e);
    return false;
  }
}
export function hasLegacyOutbox(): boolean {
  try {
    const raw = localStorage.getItem(LEGACY_OUTBOX_KEY);
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.length > 0;
  } catch { return false; }
}
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
export function enqueueCompletion(entry: Omit<OutboxEntry, 'queuedAt' | 'eventId'>): boolean {
  const current = readOutbox();
  if (!current || !entry.userId || !entry.id || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
      !Number.isSafeInteger(entry.expectedRevision) || entry.expectedRevision < 0) return false;
  const previous = current.find(e => e.userId === entry.userId && e.id === entry.id && e.date === entry.date);
  const next = current.filter(e => !(e.userId === entry.userId && e.id === entry.id && e.date === entry.date));
  next.push({ ...entry,
    expectedRevision: previous && !previous.conflicted ? previous.expectedRevision : entry.expectedRevision,
    eventId: crypto.randomUUID(), queuedAt: Date.now() });
  return writeOutbox(next);
}
export function outboxSize(userId?: string): number {
  const data = readOutbox();
  return data ? data.filter(e => !userId || e.userId === userId).length : 0;
}
export function pendingCompletion(userId: string, id: string, date: string): OutboxEntry | undefined {
  return readOutbox()?.find(e => e.userId === userId && e.id === id && e.date === date);
}
export function applyPendingCompletions<T extends { id: string; completions: string[] }>(userId: string, rows: T[]): T[] {
  const entries = readOutbox()?.filter(e => e.userId === userId) ?? [];
  return rows.map(row => {
    const changes = entries.filter(e => e.id === row.id);
    if (!changes.length) return row;
    const dates = new Set(row.completions);
    for (const change of changes) {
      if (change.completed) dates.add(change.date);
      else dates.delete(change.date);
    }
    return { ...row, completions: [...dates] };
  });
}
const inFlight = new Map<string, Promise<number>>();

function markEntryConflicted(userId: string, eventId: string, id?: string) {
  const latest = readOutbox();
  if (!latest) return;
  const blocked = latest.map(e =>
    e.userId === userId && e.eventId === eventId ? { ...e, conflicted: true } : e
  );
  if (writeOutbox(blocked) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('habtastic:outbox-conflict', {
      detail: { userId, id },
    }));
  }
}

/** Only the server may modify the actual habit row and award XP. */
export function flushOutbox(userId: string): Promise<number> {
  const existing = inFlight.get(userId);
  if (existing) return existing;
  const job = (async () => {
    if (!userId || !isOnline()) return 0;
    const entries = readOutbox()?.filter(e => e.userId === userId && !e.conflicted) ?? [];
    let synced = 0;
    let xp = 0;
    for (const entry of entries) {
      const pending = pendingCompletion(userId, entry.id, entry.date);
      if (pending?.eventId !== entry.eventId) continue;
      // Previous acknowledgements persist their revision for all remaining
      // events, so this baseline survives a failed request or app restart.
      const expected = pending.expectedRevision;
      try {
        const { data, error } = await supabase.rpc('apply_habit_completion' as never, {
          _habit_id: entry.id, _local_date: entry.date,
          _completed: entry.completed, _expected_revision: expected,
          _event_id: entry.eventId,
        } as never);
        if (error) {
          if (/completion_revision_conflict|offline_date_out_of_range|habit_revision_required/.test(error.message ?? '')) {
            // Legacy server responses may still report conflicts as errors.
            // Persist the blocked state so reconnect/refetch cannot hammer RPC.
            markEntryConflicted(userId, entry.eventId, entry.id);
          }
          continue; // Preserve unconfirmed events, including Premium-lock errors.
        }
        const result = data as { ok?: boolean; conflict?: boolean; revision?: number; xp?: number } | null;
        // Current server versions return a conflict result instead of raising
        // a PostgreSQL exception (which used to flood logs under stale clients).
        if (result?.conflict) {
          markEntryConflicted(userId, entry.eventId, entry.id);
          continue;
        }
        if (!result?.ok || !Number.isSafeInteger(result.revision)) continue;
        const newVersion = result.revision!;
        const latest = readOutbox();
        if (!latest) break; // Never destroy a corrupt queue.
        // Advance only events based on the revision this operation actually
        // consumed. Never rebase against an unrelated server-side update.
        // Persist acknowledgement removal and dependent revisions together.
        const remaining = latest.map(e =>
          e.userId === userId && e.id === entry.id &&
          e.expectedRevision === expected
            ? { ...e, expectedRevision: newVersion } : e
        ).filter(e => !(e.userId === userId && e.eventId === entry.eventId));
        if (!writeOutbox(remaining)) break;
        synced++;
        xp += Number(result.xp ?? 0);
      } catch (error) {
        console.warn('[offlineOutbox] sync deferred', error);
      }
    }
    if (synced && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('habtastic:outbox-flushed', { detail: { userId, synced, xp } }));
    }
    return synced;
  })().finally(() => { inFlight.delete(userId); });
  inFlight.set(userId, job);
  return job;
}

// localStorage writes are synchronous. A user's habit snapshot can grow large
// after months of completion history, so serialising the entire list directly
// inside a tap handler causes visible Android WebView jank. Keep the newest
// snapshot in memory immediately, then persist it shortly after the UI has had
// a chance to paint. Rapid toggles collapse into one write.
const pendingSnapshots = new Map<string, unknown>();
const snapshotTimers = new Map<string, number>();

function persistHabitsSnapshot(userId: string) {
  if (!pendingSnapshots.has(userId)) return;
  const habits = pendingSnapshots.get(userId);
  pendingSnapshots.delete(userId);
  const timer = snapshotTimers.get(userId);
  if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer);
  snapshotTimers.delete(userId);
  try {
    localStorage.setItem(CACHE_KEY(userId), JSON.stringify(habits));
  } catch {
    /* quota — ignore */
  }
}

function flushPendingSnapshots() {
  for (const userId of Array.from(pendingSnapshots.keys())) persistHabitsSnapshot(userId);
}

/** Cache a snapshot of the user's habits so they render on next cold offline start. */
export function cacheHabitsSnapshot(userId: string, habits: unknown) {
  pendingSnapshots.set(userId, habits);

  if (typeof window === 'undefined') {
    persistHabitsSnapshot(userId);
    return;
  }

  const previous = snapshotTimers.get(userId);
  if (previous !== undefined) window.clearTimeout(previous);
  snapshotTimers.set(
    userId,
    window.setTimeout(() => persistHabitsSnapshot(userId), SNAPSHOT_WRITE_DELAY_MS),
  );
}

export function readHabitsSnapshot<T = unknown>(userId: string): T | null {
  // If a newer in-memory snapshot is waiting to be persisted, prefer it.
  if (pendingSnapshots.has(userId)) return pendingSnapshots.get(userId) as T;
  try {
    const raw = localStorage.getItem(CACHE_KEY(userId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

let persistenceFlushListenersAttached = false;
function installSnapshotFlushListeners() {
  if (persistenceFlushListenersAttached || typeof window === 'undefined') return;
  persistenceFlushListenersAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSnapshots();
  });
  window.addEventListener('pagehide', flushPendingSnapshots);
}
installSnapshotFlushListeners();

export function installOutboxAutoFlush(userId: string): () => void {
  if (typeof window === 'undefined' || !userId) return () => {};
  const retry = () => { void flushOutbox(userId); };
  window.addEventListener('online', retry);
  // Fired by the backend health monitor when the servers are reachable again.
  window.addEventListener('habtastic:backend-reconnected', retry);
  retry();
  return () => {
    window.removeEventListener('online', retry);
    window.removeEventListener('habtastic:backend-reconnected', retry);
  };
}

