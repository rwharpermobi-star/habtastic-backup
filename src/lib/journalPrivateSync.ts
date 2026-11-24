import { mergePrivateDataState } from '@/lib/privateDataSync';
import {
  getPrivateDataAccessToken,
  isGoogleDrivePrivateDataAvailable,
  readGoogleDrivePrivateSnapshot,
  writeGoogleDrivePrivateSnapshot,
} from '@/lib/googleDrivePrivateData';
import {
  journalPrivateEntryStore,
  journalPrivateFolderStore,
  journalPrivateMemoryStore,
  type JournalPrivateEntry,
  type JournalPrivateFolder,
  type JournalPrivateMemory,
} from '@/lib/journalPrivateData';
import {
  readJournalPrivateLocal,
  writeJournalPrivateLocal,
} from '@/lib/journalPrivateStorage';

export type JournalPrivateSyncStatus =
  | 'local-only'
  | 'needs-connection'
  | 'synced'
  | 'remote-write-failed';

export interface JournalPrivateSyncResult {
  status: JournalPrivateSyncStatus;
  entries: number;
  folders: number;
  memories: number;
  message: string;
}

/**
 * Merge one private Journal collection. Remote data is read and validated
 * before local writes, so an invalid or unreadable backup never replaces the
 * current device copy.
 */
export function mergeJournalSnapshots<T extends { id: string; userId: string; updatedAt: string; createdAt: string }>(
  userId: string,
  local: { version: 1; updatedAt: string; records: T[]; deleted: Record<string, string> },
  remote: { version: 1; updatedAt: string; records: T[]; deleted: Record<string, string> } | null,
) {
  if (local.records.some(record => record.userId !== userId) ||
      (remote?.records.some(record => record.userId !== userId) ?? false)) {
    throw new Error('Journal sync stopped because data belongs to another account. Your device copy was kept.');
  }
  return mergePrivateDataState(local.records, local.deleted, remote);
}

/**
 * Synchronizes the three private Journal collections. On web or without a
 * cached Drive token it remains local-only; this function never prompts for
 * Google sign-in. Call only from an explicit user action.
 */
export async function syncJournalPrivateData(userId: string): Promise<JournalPrivateSyncResult> {
  if (!userId) throw new Error('A signed-in user is required for Journal sync.');

  const localEntries = readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore);
  const localFolders = readJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore);
  const localMemories = readJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore);

  const localResult = (): JournalPrivateSyncResult => ({
    status: 'local-only',
    entries: localEntries.records.length,
    folders: localFolders.records.length,
    memories: localMemories.records.length,
    message: 'Journal is saved on this device. Connect Google Drive in the installed app to sync across devices.',
  });

  if (!isGoogleDrivePrivateDataAvailable()) return localResult();

  const token = await getPrivateDataAccessToken(userId);
  if (!token) {
    return {
      ...localResult(),
      status: 'needs-connection',
      message: 'Journal is saved on this device. Connect Google Drive to enable cross-device sync.',
    };
  }

  // Read all remote snapshots before changing local state. Any read/validation
  // error aborts and preserves all three local copies.
  const [remoteEntries, remoteFolders, remoteMemories] = await Promise.all([
    readGoogleDrivePrivateSnapshot(token, userId, journalPrivateEntryStore),
    readGoogleDrivePrivateSnapshot(token, userId, journalPrivateFolderStore),
    readGoogleDrivePrivateSnapshot(token, userId, journalPrivateMemoryStore),
  ]);

  const mergedEntries = mergeJournalSnapshots(userId, localEntries, remoteEntries);
  const mergedFolders = mergeJournalSnapshots(userId, localFolders, remoteFolders);
  const mergedMemories = mergeJournalSnapshots(userId, localMemories, remoteMemories);

  // Persist merged local state first. If Drive writes fail, the newest local
  // merged copy remains available and the result clearly reports partial sync.
  writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, mergedEntries);
  writeJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore, mergedFolders);
  writeJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore, mergedMemories);

  try {
    await Promise.all([
      writeGoogleDrivePrivateSnapshot(token, userId, journalPrivateEntryStore, mergedEntries),
      writeGoogleDrivePrivateSnapshot(token, userId, journalPrivateFolderStore, mergedFolders),
      writeGoogleDrivePrivateSnapshot(token, userId, journalPrivateMemoryStore, mergedMemories),
    ]);
  } catch {
    return {
      status: 'remote-write-failed',
      entries: mergedEntries.records.length,
      folders: mergedFolders.records.length,
      memories: mergedMemories.records.length,
      message: 'Journal is saved on this device, but Google Drive did not confirm every upload. Try syncing again.',
    };
  }

  return {
    status: 'synced',
    entries: mergedEntries.records.length,
    folders: mergedFolders.records.length,
    memories: mergedMemories.records.length,
    message: 'Journal changes were saved on this device and Google Drive.',
  };
}
