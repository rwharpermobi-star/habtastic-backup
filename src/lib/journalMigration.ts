import type { GoogleDrivePrivateSnapshot } from '@/lib/googleDrivePrivateData';
import { journalPrivateEntryStore, journalPrivateFolderStore, journalPrivateMemoryStore, type JournalPrivateEntry, type JournalPrivateFolder, type JournalPrivateMemory } from '@/lib/journalPrivateData';
import { journalPrivateLocalKey, writeJournalPrivateLocal } from '@/lib/journalPrivateStorage';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Journal migration stopped: record is missing ${field}. Existing Supabase data was not changed.`);
  }
  return value;
}

function dateValue(row: Row, field: string, fallbackField = 'created_at'): string {
  const value = row[field] ?? row[fallbackField];
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Journal migration stopped: record has an invalid ${field}. Existing Supabase data was not changed.`);
  }
  return value;
}

function asRows(rows: unknown[]): Row[] {
  if (!Array.isArray(rows) || !rows.every(isRow)) {
    throw new Error('Journal migration stopped: source data is not a valid list. Existing Supabase data was not changed.');
  }
  return rows;
}

function snapshot<T>(records: T[]): GoogleDrivePrivateSnapshot<T & { id: string }> {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: records as Array<T & { id: string }>,
    deleted: {},
  };
}

/** Converts a read-only copy of Supabase rows to the versioned local format. */
export function migrateJournalEntryRows(userId: string, source: unknown[]): GoogleDrivePrivateSnapshot<JournalPrivateEntry> {
  if (!userId) throw new Error('A signed-in user is required for Journal migration.');
  const records = asRows(source).map(row => {
    const owner = requiredString(row, 'user_id');
    if (owner !== userId) throw new Error('Journal migration stopped: source record belongs to another user.');
    const topics = row.topics ?? [];
    if (!Array.isArray(topics) || !topics.every(topic => typeof topic === 'string')) {
      throw new Error('Journal migration stopped: an entry has invalid topics.');
    }
    const intensity = row.mood_intensity ?? 5;
    if (typeof intensity !== 'number' || !Number.isFinite(intensity)) {
      throw new Error('Journal migration stopped: an entry has invalid mood intensity.');
    }
    const feedback = row.ai_feedback ?? null;
    if (feedback !== null && typeof feedback !== 'string') {
      throw new Error('Journal migration stopped: an entry has invalid AI feedback.');
    }
    const folder = row.folder_id ?? null;
    if (folder !== null && typeof folder !== 'string') {
      throw new Error('Journal migration stopped: an entry has an invalid folder reference.');
    }
    return {
      id: requiredString(row, 'id'),
      userId: owner,
      content: requiredString(row, 'content'),
      mood: typeof row.mood === 'string' ? row.mood : 'neutral',
      moodIntensity: intensity,
      topics: topics as string[],
      aiFeedback: feedback,
      isVoice: row.is_voice === true,
      folderId: folder as string | null,
      createdAt: dateValue(row, 'created_at'),
      updatedAt: dateValue(row, 'updated_at'),
    };
  });
  return snapshot(records) as GoogleDrivePrivateSnapshot<JournalPrivateEntry>;
}

export function migrateJournalFolderRows(userId: string, source: unknown[]): GoogleDrivePrivateSnapshot<JournalPrivateFolder> {
  if (!userId) throw new Error('A signed-in user is required for Journal migration.');
  const records = asRows(source).map(row => {
    const owner = requiredString(row, 'user_id');
    if (owner !== userId) throw new Error('Journal migration stopped: source record belongs to another user.');
    return {
      id: requiredString(row, 'id'),
      userId: owner,
      name: requiredString(row, 'name'),
      emoji: typeof row.emoji === 'string' ? row.emoji : '📁',
      color: typeof row.color === 'string' ? row.color : 'hsl(27, 100%, 50%)',
      createdAt: dateValue(row, 'created_at'),
      updatedAt: dateValue(row, 'updated_at'),
    };
  });
  return snapshot(records) as GoogleDrivePrivateSnapshot<JournalPrivateFolder>;
}

export function migrateJournalMemoryRows(userId: string, source: unknown[]): GoogleDrivePrivateSnapshot<JournalPrivateMemory> {
  if (!userId) throw new Error('A signed-in user is required for Journal migration.');
  const records = asRows(source).map(row => {
    const owner = requiredString(row, 'user_id');
    if (owner !== userId) throw new Error('Journal migration stopped: source record belongs to another user.');
    const relevance = row.relevance_score ?? 0;
    if (typeof relevance !== 'number' || !Number.isFinite(relevance)) {
      throw new Error('Journal migration stopped: a memory has invalid relevance score.');
    }
    return {
      id: requiredString(row, 'id'),
      userId: owner,
      memoryType: requiredString(row, 'memory_type'),
      content: requiredString(row, 'content'),
      relevanceScore: relevance,
      createdAt: dateValue(row, 'created_at'),
      updatedAt: dateValue(row, 'updated_at'),
    };
  });
  return snapshot(records) as GoogleDrivePrivateSnapshot<JournalPrivateMemory>;
}


export interface JournalMigrationSource {
  entries: unknown[];
  folders: unknown[];
  memories: unknown[];
}

export type JournalMigrationCollections = Partial<Record<'entries' | 'folders' | 'memories', boolean>>;

/**
 * Repairs only absent local collections from already-fetched Supabase rows.
 * Existing snapshots are never replaced. All requested rows are validated
 * before the first write.
 */
export function importMissingJournalRowsToLocal(
  userId: string,
  source: Partial<JournalMigrationSource>,
  missing: JournalMigrationCollections,
): boolean {
  if (!userId) throw new Error('A signed-in user is required for Journal migration.');
  const keys = {
    entries: journalPrivateLocalKey(userId, 'entries'),
    folders: journalPrivateLocalKey(userId, 'folders'),
    memories: journalPrivateLocalKey(userId, 'memories'),
  };

  for (const type of ['entries', 'folders', 'memories'] as const) {
    if (missing[type] && localStorage.getItem(keys[type]) !== null) {
      throw new Error('Journal device copy changed during recovery. Nothing was overwritten; retry preparation.');
    }
  }

  if ((missing.entries && !Array.isArray(source.entries)) ||
      (missing.folders && !Array.isArray(source.folders)) ||
      (missing.memories && !Array.isArray(source.memories))) {
    throw new Error('Journal recovery stopped because source rows for a missing collection were unavailable. Existing local data was not changed.');
  }

  const entries = missing.entries
    ? migrateJournalEntryRows(userId, source.entries!)
    : null;
  const folders = missing.folders
    ? migrateJournalFolderRows(userId, source.folders!)
    : null;
  const memories = missing.memories
    ? migrateJournalMemoryRows(userId, source.memories!)
    : null;

  if (!entries && !folders && !memories) return false;
  if (entries) writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, entries);
  if (folders) writeJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore, folders);
  if (memories) writeJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore, memories);
  return true;
}

/**
 * Imports a complete, validated Supabase read into local storage only when
 * none of the user's Journal local snapshots exist. Never overwrites a
 * pre-existing or malformed local copy, and never mutates the Supabase source.
 */
export function importJournalRowsToLocalIfEmpty(
  userId: string,
  source: JournalMigrationSource,
): boolean {
  if (!userId) throw new Error('A signed-in user is required for Journal migration.');

  const keys = [
    journalPrivateLocalKey(userId, 'entries'),
    journalPrivateLocalKey(userId, 'folders'),
    journalPrivateLocalKey(userId, 'memories'),
  ];
  if (keys.some(key => localStorage.getItem(key) !== null)) return false;

  // Validate and convert every collection before writing any of them.
  const entries = migrateJournalEntryRows(userId, source.entries);
  const folders = migrateJournalFolderRows(userId, source.folders);
  const memories = migrateJournalMemoryRows(userId, source.memories);

  try {
    writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, entries);
    writeJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore, folders);
    writeJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore, memories);
    return true;
  } catch (error) {
    // The keys were confirmed absent above. Remove any partial first import
    // so the next attempt can start cleanly; the remote source is untouched.
    for (const key of keys) {
      try { localStorage.removeItem(key); } catch { /* Preserve the original error. */ }
    }
    throw error;
  }
}
