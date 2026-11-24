import { describe, expect, it } from 'vitest';
import { mergeJournalSnapshots } from '@/lib/journalPrivateSync';

type RecordValue = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

const snapshot = (records: RecordValue[], deleted: Record<string, string> = {}) => ({
  version: 1 as const,
  updatedAt: '2026-10-09T00:00:00.000Z',
  records,
  deleted,
});

const localRecord: RecordValue = {
  id: 'entry-1',
  userId: 'user-1',
  content: 'local old',
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

describe('mergeJournalSnapshots', () => {
  it('merges the newest matching record from Drive', () => {
    const remote = {
      ...localRecord,
      content: 'remote newer',
      updatedAt: '2026-10-08T11:00:00.000Z',
    };
    const result = mergeJournalSnapshots('user-1', snapshot([localRecord]), snapshot([remote]));
    expect(result.records).toEqual([remote]);
  });

  it('preserves tombstones so deleted entries do not reappear', () => {
    const result = mergeJournalSnapshots(
      'user-1',
      snapshot([localRecord], { 'entry-1': '2026-10-08T12:00:00.000Z' }),
      null,
    );
    expect(result.records).toEqual([]);
    expect(result.deleted['entry-1']).toBe('2026-10-08T12:00:00.000Z');
  });

  it('refuses local or remote records belonging to another user', () => {
    const otherUser = { ...localRecord, userId: 'user-2' };
    expect(() => mergeJournalSnapshots('user-1', snapshot([otherUser]), null))
      .toThrow(/another account/i);
    expect(() => mergeJournalSnapshots('user-1', snapshot([localRecord]), snapshot([otherUser])))
      .toThrow(/another account/i);
  });
});
