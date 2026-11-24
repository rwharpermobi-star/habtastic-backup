import { beforeEach, describe, expect, it } from 'vitest';
import {
  migrateJournalEntryRows,
  migrateJournalFolderRows,
  migrateJournalMemoryRows,
  importJournalRowsToLocalIfEmpty,
  importMissingJournalRowsToLocal,
} from '@/lib/journalMigration';
import { journalPrivateEntryStore } from '@/lib/journalPrivateData';
import { writeJournalPrivateLocal } from '@/lib/journalPrivateStorage';
import { journalPrivateLocalKey } from '@/lib/journalPrivateStorage';

const createdAt = '2026-10-08T10:00:00.000Z';

describe('read-only Journal migration adapter', () => {
  beforeEach(() => localStorage.clear());
  it('converts entries without mutating source rows', () => {
    const source = [{
      id: 'entry-1',
      user_id: 'user-1',
      content: 'Private reflection',
      mood: 'happy',
      mood_intensity: 8,
      topics: ['family'],
      ai_feedback: 'Keep going',
      is_voice: true,
      folder_id: 'folder-1',
      created_at: createdAt,
      updated_at: createdAt,
    }];
    const before = JSON.stringify(source);
    const result = migrateJournalEntryRows('user-1', source);

    expect(result.records[0]).toMatchObject({
      id: 'entry-1',
      userId: 'user-1',
      content: 'Private reflection',
      moodIntensity: 8,
      folderId: 'folder-1',
      isVoice: true,
    });
    expect(result.deleted).toEqual({});
    expect(JSON.stringify(source)).toBe(before);
  });

  it('converts folders and memories into separate versioned snapshots', () => {
    const folders = migrateJournalFolderRows('user-1', [{
      id: 'folder-1', user_id: 'user-1', name: 'Personal', created_at: createdAt,
    }]);
    const memories = migrateJournalMemoryRows('user-1', [{
      id: 'memory-1', user_id: 'user-1', memory_type: 'insight',
      content: 'Consistency helps', relevance_score: 0.6, created_at: createdAt,
    }]);

    expect(folders.records[0].emoji).toBe('📁');
    expect(folders.records[0].updatedAt).toBe(createdAt);
    expect(memories.records[0].memoryType).toBe('insight');
    expect(memories.records[0].updatedAt).toBe(createdAt);
  });

  it('refuses data belonging to another account', () => {
    expect(() => migrateJournalEntryRows('user-1', [{
      id: 'entry-1', user_id: 'user-2', content: 'other account', created_at: createdAt,
    }])).toThrow(/another user/i);
  });

  it('stops safely on malformed records instead of dropping them', () => {
    expect(() => migrateJournalEntryRows('user-1', [{
      id: 'entry-1', user_id: 'user-1', content: 'missing timestamp',
    }])).toThrow(/migration stopped/i);
  });

  it('imports all three collections only when every local snapshot is absent', () => {
    const source = {
      entries: [{
        id: 'entry-1', user_id: 'user-1', content: 'Private reflection',
        created_at: createdAt, updated_at: createdAt,
      }],
      folders: [{
        id: 'folder-1', user_id: 'user-1', name: 'Personal', created_at: createdAt,
      }],
      memories: [{
        id: 'memory-1', user_id: 'user-1', memory_type: 'insight',
        content: 'Consistency helps', created_at: createdAt,
      }],
    };
    const before = JSON.stringify(source);

    expect(importJournalRowsToLocalIfEmpty('user-1', source)).toBe(true);
    expect(JSON.parse(localStorage.getItem(journalPrivateLocalKey('user-1', 'entries'))!).records)
      .toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(journalPrivateLocalKey('user-1', 'folders'))!).records)
      .toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(journalPrivateLocalKey('user-1', 'memories'))!).records)
      .toHaveLength(1);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('does not overwrite any existing local snapshot', () => {
    const entriesKey = journalPrivateLocalKey('user-1', 'entries');
    localStorage.setItem(entriesKey, '{preserve this local copy');

    expect(importJournalRowsToLocalIfEmpty('user-1', {
      entries: [], folders: [], memories: [],
    })).toBe(false);
    expect(localStorage.getItem(entriesKey)).toBe('{preserve this local copy');
    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'folders'))).toBeNull();
    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'memories'))).toBeNull();
  });

  it('validates all source collections before writing any local snapshot', () => {
    expect(() => importJournalRowsToLocalIfEmpty('user-1', {
      entries: [{
        id: 'entry-1', user_id: 'user-1', content: 'Valid', created_at: createdAt,
      }],
      folders: [],
      memories: [{
        id: 'memory-1', user_id: 'user-1', memory_type: 'insight',
        content: 'Invalid timestamp',
      }],
    })).toThrow(/migration stopped/i);

    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'entries'))).toBeNull();
    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'folders'))).toBeNull();
    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'memories'))).toBeNull();
  });


  it('repairs only missing collections while preserving existing local entries', () => {
    const entriesKey = journalPrivateLocalKey('user-1', 'entries');
    const existingEntries = migrateJournalEntryRows('user-1', [{
      id: 'local-entry', user_id: 'user-1', content: 'Unsynced local edit',
      created_at: createdAt, updated_at: createdAt,
    }]);
    writeJournalPrivateLocal('user-1', 'entries', journalPrivateEntryStore, existingEntries);

    const changed = importMissingJournalRowsToLocal('user-1', {
      folders: [{
        id: 'folder-1', user_id: 'user-1', name: 'Personal', created_at: createdAt,
      }],
      memories: [{
        id: 'memory-1', user_id: 'user-1', memory_type: 'insight',
        content: 'Keep going', relevance_score: 0.7, created_at: createdAt,
      }],
    }, { entries: false, folders: true, memories: true });

    expect(changed).toBe(true);
    expect(JSON.parse(localStorage.getItem(entriesKey)!).records[0].content)
      .toBe('Unsynced local edit');
    expect(JSON.parse(localStorage.getItem(journalPrivateLocalKey('user-1', 'folders'))!).records)
      .toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(journalPrivateLocalKey('user-1', 'memories'))!).records)
      .toHaveLength(1);
  });

  it('validates every missing collection before writing any missing snapshot', () => {
    const entriesKey = journalPrivateLocalKey('user-1', 'entries');
    localStorage.setItem(entriesKey, '{keep this local snapshot');
    expect(() => importMissingJournalRowsToLocal('user-1', {
      folders: [{
        id: 'folder-1', user_id: 'user-1', name: 'Personal', created_at: createdAt,
      }],
      memories: [{
        id: 'memory-1', user_id: 'user-1', memory_type: 'insight',
        content: 'Bad timestamp',
      }],
    }, { entries: false, folders: true, memories: true })).toThrow(/migration stopped/i);

    expect(localStorage.getItem(entriesKey)).toBe('{keep this local snapshot');
    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'folders'))).toBeNull();
    expect(localStorage.getItem(journalPrivateLocalKey('user-1', 'memories'))).toBeNull();
  });

  it('does not overwrite a collection that appeared during recovery', () => {
    const entriesKey = journalPrivateLocalKey('user-1', 'entries');
    localStorage.setItem(entriesKey, '{preserve local copy');
    expect(() => importMissingJournalRowsToLocal('user-1', {
      entries: [{
        id: 'entry-1', user_id: 'user-1', content: 'Remote row', created_at: createdAt,
      }],
    }, { entries: true, folders: false, memories: false }))
      .toThrow(/changed during recovery/i);
    expect(localStorage.getItem(entriesKey)).toBe('{preserve local copy');
  });

});
