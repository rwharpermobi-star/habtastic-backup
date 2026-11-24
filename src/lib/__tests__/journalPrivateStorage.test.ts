import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasCompleteJournalPrivateLocalSnapshot,
  journalPrivateLocalKey,
  readJournalPrivateLocal,
  writeJournalPrivateLocal,
} from '@/lib/journalPrivateStorage';
import { journalPrivateEntryStore, type JournalPrivateEntry } from '@/lib/journalPrivateData';

const entry: JournalPrivateEntry = {
  id: 'entry-1',
  userId: 'user-1',
  content: 'A private reflection',
  mood: 'neutral',
  moodIntensity: 5,
  topics: [],
  aiFeedback: null,
  isVoice: false,
  folderId: null,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

describe('journalPrivateStorage', () => {
  beforeEach(() => localStorage.clear());

  it('creates distinct keys for each user and data type', () => {
    expect(journalPrivateLocalKey('user/1', 'entries')).not.toBe(
      journalPrivateLocalKey('user-1', 'entries'),
    );
    expect(journalPrivateLocalKey('user-1', 'entries')).not.toBe(
      journalPrivateLocalKey('user-1', 'memories'),
    );
  });

  it('writes and reads a validated snapshot for the owning user', () => {
    writeJournalPrivateLocal('user-1', 'entries', journalPrivateEntryStore, {
      version: 1,
      updatedAt: '2026-10-08T10:00:00.000Z',
      records: [entry],
      deleted: {},
    });

    expect(readJournalPrivateLocal('user-1', 'entries', journalPrivateEntryStore).records).toEqual([entry]);
    expect(readJournalPrivateLocal('user-2', 'entries', journalPrivateEntryStore).records).toEqual([]);
  });

  it('refuses records belonging to another user', () => {
    expect(() => writeJournalPrivateLocal('user-2', 'entries', journalPrivateEntryStore, {
      version: 1,
      updatedAt: '2026-10-08T10:00:00.000Z',
      records: [entry],
      deleted: {},
    })).toThrow(/validation/i);
  });

  it('preserves malformed saved data instead of silently replacing it', () => {
    const key = journalPrivateLocalKey('user-1', 'entries');
    localStorage.setItem(key, '{broken json');

    expect(() => readJournalPrivateLocal('user-1', 'entries', journalPrivateEntryStore)).toThrow(/preserved/i);
    expect(localStorage.getItem(key)).toBe('{broken json');
  });

  it('rejects invalid tombstones', () => {
    expect(() => writeJournalPrivateLocal('user-1', 'entries', journalPrivateEntryStore, {
      version: 1,
      updatedAt: '2026-10-08T10:00:00.000Z',
      records: [entry],
      deleted: { 'other-entry': 'not-a-date' },
    })).toThrow(/validation/i);
  });
});
