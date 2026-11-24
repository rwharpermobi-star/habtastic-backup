import { describe, expect, it } from 'vitest';
import { mergePrivateDataState, type PrivateDataSnapshot } from '@/lib/privateDataSync';

type TestRecord = {
  id: string;
  value: string;
  updatedAt: string;
};

const snapshot = (records: TestRecord[], deleted: Record<string, string> = {}): PrivateDataSnapshot<TestRecord> => ({
  version: 1,
  updatedAt: '2026-10-08T00:00:00.000Z',
  records,
  deleted,
});

describe('mergePrivateDataState', () => {
  it('keeps the newest record across devices', () => {
    const result = mergePrivateDataState(
      [{ id: 'a', value: 'local-old', updatedAt: '2026-10-08T00:00:00.000Z' }],
      {},
      snapshot([{ id: 'a', value: 'remote-new', updatedAt: '2026-10-08T00:01:00.000Z' }]),
    );

    expect(result.records).toEqual([
      { id: 'a', value: 'remote-new', updatedAt: '2026-10-08T00:01:00.000Z' },
    ]);
  });

  it('keeps the local record when timestamps tie', () => {
    const result = mergePrivateDataState(
      [{ id: 'a', value: 'local', updatedAt: '2026-10-08T00:01:00.000Z' }],
      {},
      snapshot([{ id: 'a', value: 'remote', updatedAt: '2026-10-08T00:01:00.000Z' }]),
    );

    expect(result.records).toEqual([
      { id: 'a', value: 'local', updatedAt: '2026-10-08T00:01:00.000Z' },
    ]);
  });

  it('merges local and remote tombstones and removes deleted records', () => {
    const result = mergePrivateDataState(
      [{ id: 'a', value: 'keep', updatedAt: '2026-10-08T00:01:00.000Z' }],
      { b: '2026-10-08T00:03:00.000Z' },
      snapshot(
        [{ id: 'b', value: 'deleted', updatedAt: '2026-10-08T00:02:00.000Z' }],
        { c: '2026-10-08T00:04:00.000Z' },
      ),
    );

    expect(result.records).toEqual([
      { id: 'a', value: 'keep', updatedAt: '2026-10-08T00:01:00.000Z' },
    ]);
    expect(result.deleted).toEqual({
      b: '2026-10-08T00:03:00.000Z',
      c: '2026-10-08T00:04:00.000Z',
    });
  });

  it('allows a newer edit to resurrect an older tombstone', () => {
    const result = mergePrivateDataState(
      [{ id: 'a', value: 'new-edit', updatedAt: '2026-10-08T00:02:00.000Z' }],
      {},
      snapshot([], { a: '2026-10-08T00:01:00.000Z' }),
    );

    expect(result.records).toEqual([
      { id: 'a', value: 'new-edit', updatedAt: '2026-10-08T00:02:00.000Z' },
    ]);
  });
});
