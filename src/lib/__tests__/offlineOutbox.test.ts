import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueCompletion, flushOutbox, outboxSize, applyPendingCompletions,
  hasLegacyOutbox, pendingCompletion,
} from '@/lib/offlineOutbox';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const user = 'user-a';
const id = 'a29b0f0a-8336-426e-82cd-c09e4ec2af0f';
const date = '2026-10-10';
const entry = (completed: boolean, expectedRevision = 4) => ({
  userId: user, id, date, completed, expectedRevision,
});

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset();
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValueOnce('event-1')
      .mockReturnValueOnce('event-2').mockReturnValueOnce('event-3')
      .mockReturnValue('event-new'),
  });
});
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('offline habit completion durability', () => {
  it('reports failure and does not queue when device storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(enqueueCompletion(entry(true))).toBe(false);
    expect(outboxSize(user)).toBe(0);
    spy.mockRestore();
  });

  it('preserves the pre-existing full-snapshot queue without replaying it', async () => {
    const legacy = [{ id, completions: ['2026-10-09'], queuedAt: 1 }];
    localStorage.setItem('habtastic-offline-outbox-v1', JSON.stringify(legacy));
    expect(hasLegacyOutbox()).toBe(true);
    expect(await flushOutbox(user)).toBe(0);
    expect(localStorage.getItem('habtastic-offline-outbox-v1')).toBe(JSON.stringify(legacy));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('replays only a date-specific event, never replacing completions[]', async () => {
    expect(enqueueCompletion(entry(true))).toBe(true);
    rpc.mockResolvedValueOnce({ error: null, data: { ok: true, revision: 5, xp: 10 } });
    expect(await flushOutbox(user)).toBe(1);
    expect(outboxSize(user)).toBe(0);
    expect(rpc).toHaveBeenCalledWith('apply_habit_completion', expect.objectContaining({
      _habit_id: id, _local_date: date, _completed: true, _expected_revision: 4,
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('completions');
  });

  it('retains but blocks a conflicted event from repeated automatic retries', async () => {
    enqueueCompletion(entry(true));
    rpc.mockResolvedValueOnce({ error: { message: 'completion_revision_conflict' }, data: null });
    expect(await flushOutbox(user)).toBe(0);
    expect(outboxSize(user)).toBe(1);
    expect(pendingCompletion(user, id, date)).toMatchObject({ conflicted: true });

    expect(await flushOutbox(user)).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('allows an explicit new attempt to use the refreshed server revision', async () => {
    enqueueCompletion(entry(true));
    rpc.mockResolvedValueOnce({ error: { message: 'completion_revision_conflict' }, data: null });
    expect(await flushOutbox(user)).toBe(0);

    // A deliberate user action after the server refresh creates a fresh event
    // and must not inherit the stale revision from the conflicted event.
    enqueueCompletion(entry(false, 8));
    expect(pendingCompletion(user, id, date)).toMatchObject({
      completed: false, expectedRevision: 8,
    });
    rpc.mockResolvedValueOnce({ error: null, data: { ok: true, revision: 9, xp: 0 } });
    expect(await flushOutbox(user)).toBe(1);
    expect(rpc.mock.lastCall?.[1]).toMatchObject({ _expected_revision: 8, _completed: false });
    expect(outboxSize(user)).toBe(0);
  });

  it('keeps locked Premium progress queued until access is restored', async () => {
    enqueueCompletion(entry(true));
    rpc.mockResolvedValueOnce({ error: { message: 'free_habit_locked' }, data: null });
    expect(await flushOutbox(user)).toBe(0);
    expect(outboxSize(user)).toBe(1);
    rpc.mockResolvedValueOnce({ error: null, data: { ok: true, revision: 5, xp: 10 } });
    expect(await flushOutbox(user)).toBe(1);
    expect(outboxSize(user)).toBe(0);
  });

  it('coalesces toggles on one date without changing other dates', () => {
    enqueueCompletion(entry(true));
    enqueueCompletion(entry(false, 99));
    expect(outboxSize(user)).toBe(1);
    expect(pendingCompletion(user, id, date)).toMatchObject({
      completed: false, expectedRevision: 4,
    });
    const rows = [{ id, completions: ['2026-10-09', date] }];
    expect(applyPendingCompletions(user, rows)[0].completions).toEqual(['2026-10-09']);
    expect(rows[0].completions).toEqual(['2026-10-09', date]);
  });

  it('preserves a newer tap while an older RPC response is in flight', async () => {
    enqueueCompletion(entry(true));
    rpc.mockImplementationOnce(async () => {
      enqueueCompletion(entry(false));
      return { error: null, data: { ok: true, revision: 5, xp: 10 } };
    });
    expect(await flushOutbox(user)).toBe(1);
    expect(pendingCompletion(user, id, date)).toMatchObject({
      completed: false, expectedRevision: 5,
    });
    rpc.mockResolvedValueOnce({ error: null, data: { ok: true, revision: 6, xp: 0 } });
    expect(await flushOutbox(user)).toBe(1);
    expect(rpc.mock.lastCall?.[1]).toMatchObject({ _expected_revision: 5, _completed: false });
  });

  it('never replays another signed-in account’s changes', async () => {
    enqueueCompletion(entry(true));
    enqueueCompletion({ ...entry(true), userId: 'user-b' });
    rpc.mockResolvedValueOnce({ error: null, data: { ok: true, revision: 5, xp: 10 } });
    expect(await flushOutbox(user)).toBe(1);
    expect(outboxSize('user-b')).toBe(1);
    expect(outboxSize(user)).toBe(0);
  });
});
