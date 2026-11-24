import { supabase } from '@/integrations/supabase/client';
import {
  journalPrivateLocalKey,
  readJournalPrivateLocal,
} from '@/lib/journalPrivateStorage';
import {
  journalPrivateEntryStore,
  journalPrivateFolderStore,
  journalPrivateMemoryStore,
} from '@/lib/journalPrivateData';
import {
  importJournalRowsToLocalIfEmpty,
  importMissingJournalRowsToLocal,
} from '@/lib/journalMigration';

const PAGE_SIZE = 500;
const MAX_ROWS_PER_COLLECTION = 5000;

export async function collectJournalRows(
  fetchPage: (from: number, to: number) => Promise<unknown[]>,
  pageSize = PAGE_SIZE,
  maxRows = MAX_ROWS_PER_COLLECTION,
): Promise<unknown[]> {
  const rows: unknown[] = [];

  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (!Array.isArray(page)) {
      throw new Error('Journal migration stopped because a page was not a valid list.');
    }
    rows.push(...page);

    if (rows.length > maxRows) {
      throw new Error(
        `Journal migration stopped because a collection exceeds the safe ${maxRows}-record local limit. Existing data was not changed.`,
      );
    }
    if (page.length < pageSize) return rows;
  }
}

async function readAllUserRows(
  table: 'journal_entries' | 'journal_memories' | 'journal_folders',
  userId: string,
): Promise<unknown[]> {
  return collectJournalRows(async (from, to) => {
    let query = supabase.from(table).select('*').eq('user_id', userId);
    query = query.order('created_at', { ascending: true }).range(from, to);
    const { data, error } = await query;

    if (error) {
      throw new Error(`Journal migration could not read ${table}. Existing server data was not changed.`);
    }
    return (data || []) as unknown[];
  });
}

/**
 * Performs a full paginated, read-only Supabase import to this device.
 * Call only from an explicit migration action; this does not enable ongoing
 * local-first writes or Google Drive sync.
 */
export async function migrateJournalFromSupabaseToLocal(userId: string): Promise<boolean> {
  if (!userId) throw new Error('A signed-in user is required for Journal migration.');

  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId) {
    throw new Error('Journal migration stopped because the signed-in account could not be verified.');
  }

  const keys = {
    entries: journalPrivateLocalKey(userId, 'entries'),
    folders: journalPrivateLocalKey(userId, 'folders'),
    memories: journalPrivateLocalKey(userId, 'memories'),
  };
  const existing = {
    entries: localStorage.getItem(keys.entries) !== null,
    folders: localStorage.getItem(keys.folders) !== null,
    memories: localStorage.getItem(keys.memories) !== null,
  };

  // Validate every existing snapshot before attempting any repair. Never
  // overwrite a malformed or partial device copy automatically.
  if (existing.entries) readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore);
  if (existing.folders) readJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore);
  if (existing.memories) readJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore);

  if (!existing.entries && !existing.folders && !existing.memories) {
    // Fetch all collections before first import; any read error aborts without writes.
    const [entries, folders, memories] = await Promise.all([
      readAllUserRows('journal_entries', userId),
      readAllUserRows('journal_folders', userId),
      readAllUserRows('journal_memories', userId),
    ]);
    return importJournalRowsToLocalIfEmpty(userId, { entries, folders, memories });
  }

  const missing = {
    entries: !existing.entries,
    folders: !existing.folders,
    memories: !existing.memories,
  };
  // Read only missing collections. Existing local collections and tombstones
  // remain untouched, including offline edits.
  const [entries, folders, memories] = await Promise.all([
    missing.entries ? readAllUserRows('journal_entries', userId) : Promise.resolve(undefined),
    missing.folders ? readAllUserRows('journal_folders', userId) : Promise.resolve(undefined),
    missing.memories ? readAllUserRows('journal_memories', userId) : Promise.resolve(undefined),
  ]);

  return importMissingJournalRowsToLocal(userId, {
    ...(entries === undefined ? {} : { entries }),
    ...(folders === undefined ? {} : { folders }),
    ...(memories === undefined ? {} : { memories }),
  }, missing);
}
