import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteLocalJournalEntry,
  deleteLocalJournalFolder,
  moveLocalJournalEntry,
  readLocalJournalEntries,
  upsertLocalJournalEntry,
} from '@/lib/journalPrivateRepository';
import {
  journalPrivateEntryStore,
  journalPrivateFolderStore,
  journalPrivateMemoryStore,
} from '@/lib/journalPrivateData';
import { writeJournalPrivateLocal } from '@/lib/journalPrivateStorage';

const entry = {
  id: 'entry-1',
  user_id: 'user-1',
  content: 'Private note',
  mood: 'neutral',
  mood_intensity: 5,
  topics: [],
  ai_feedback: null,
  is_voice: false,
  folder_id: null,
  created_at: '2026-10-08T10:00:00.000Z',
};

function setupSnapshots() {
  writeJournalPrivateLocal('user-1', 'entries', journalPrivateEntryStore, {
    version: 1, updatedAt: entry.created_at,
    records: [{
      id: entry.id, userId: 'user-1', content: entry.content, mood: entry.mood,
      moodIntensity: entry.mood_intensity, topics: [], aiFeedback: null, isVoice: false,
      folderId: null, createdAt: entry.created_at, updatedAt: entry.created_at,
    }], deleted: {},
  });
  writeJournalPrivateLocal('user-1', 'folders', journalPrivateFolderStore, {
    version: 1, updatedAt: entry.created_at, records: [], deleted: {},
  });
  writeJournalPrivateLocal('user-1', 'memories', journalPrivateMemoryStore, {
    version: 1, updatedAt: entry.created_at, records: [], deleted: {},
  });
}

describe('journalPrivateRepository', () => {
  beforeEach(() => localStorage.clear());

  it('reads the local Journal snapshot after migration', () => {
    setupSnapshots();
    expect(readLocalJournalEntries('user-1')).toMatchObject([entry]);
    expect(readLocalJournalEntries('user-2')).toBeNull();
  });

  it('updates a local record without losing its user ownership', () => {
    setupSnapshots();
    upsertLocalJournalEntry('user-1', { ...entry, content: 'Updated note' });
    expect(readLocalJournalEntries('user-1')?.[0].content).toBe('Updated note');
  });

  it('records a deletion tombstone so the entry will not return during sync', () => {
    setupSnapshots();
    deleteLocalJournalEntry('user-1', 'entry-1');
    expect(readLocalJournalEntries('user-1')).toEqual([]);
  });

  it('updates folder assignment on the local entry', () => {
    setupSnapshots();
    moveLocalJournalEntry('user-1', 'entry-1', 'folder-2');
    expect(readLocalJournalEntries('user-1')?.[0].folder_id).toBe('folder-2');
  });

  it('clears local entry folder references when a folder is deleted', () => {
    setupSnapshots();
    moveLocalJournalEntry('user-1', 'entry-1', 'folder-2');
    deleteLocalJournalFolder('user-1', 'folder-2');
    expect(readLocalJournalEntries('user-1')?.[0].folder_id).toBeNull();
  });
});
