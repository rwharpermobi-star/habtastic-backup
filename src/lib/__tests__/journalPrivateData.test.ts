import { describe, expect, it } from 'vitest';
import {
  isJournalPrivateEntry,
  isJournalPrivateFolder,
  isJournalPrivateMemory,
  journalPrivateEntryStore,
  journalPrivateFolderStore,
  journalPrivateMemoryStore,
} from '@/lib/journalPrivateData';

const entry = {
  id: 'entry-1',
  userId: 'user-1',
  content: 'Today I felt focused.',
  mood: 'motivated',
  moodIntensity: 7,
  topics: ['work', 'habits'],
  aiFeedback: 'Keep building consistency.',
  isVoice: false,
  folderId: null,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

const folder = {
  id: 'folder-1',
  userId: 'user-1',
  name: 'Personal',
  emoji: '📁',
  color: 'hsl(27, 100%, 50%)',
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

const memory = {
  id: 'memory-1',
  userId: 'user-1',
  memoryType: 'insight',
  content: 'Consistency matters more than intensity.',
  relevanceScore: 0.7,
  createdAt: '2026-10-08T10:00:00.000Z',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

describe('private Journal data contracts', () => {
  it('validates a complete journal entry and rejects malformed fields', () => {
    expect(isJournalPrivateEntry(entry)).toBe(true);
    expect(isJournalPrivateEntry({ ...entry, topics: ['valid', 3] })).toBe(false);
    expect(isJournalPrivateEntry({ ...entry, updatedAt: 'not-a-date' })).toBe(false);
  });

  it('validates folders', () => {
    expect(isJournalPrivateFolder(folder)).toBe(true);
    expect(isJournalPrivateFolder({ ...folder, name: 12 })).toBe(false);
  });

  it('validates private memories', () => {
    expect(isJournalPrivateMemory(memory)).toBe(true);
    expect(isJournalPrivateMemory({ ...memory, relevanceScore: Number.NaN })).toBe(false);
  });

  it('uses separate versioned Drive app-data file names per user and data type', () => {
    expect(journalPrivateEntryStore.fileName('user/1')).toBe('habtastic-journal-entries-v1-user%2F1.json');
    expect(journalPrivateFolderStore.fileName('user-1')).toBe('habtastic-journal-folders-v1-user-1.json');
    expect(journalPrivateMemoryStore.fileName('user-1')).toBe('habtastic-journal-memories-v1-user-1.json');
  });

  it('exposes the matching validators to the Drive transport', () => {
    expect(journalPrivateEntryStore.validateRecord(entry)).toBe(true);
    expect(journalPrivateFolderStore.validateRecord(folder)).toBe(true);
    expect(journalPrivateMemoryStore.validateRecord(memory)).toBe(true);
  });
});
