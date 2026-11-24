import type { GoogleDrivePrivateRecord, GoogleDrivePrivateSnapshot, GoogleDrivePrivateStore } from '@/lib/googleDrivePrivateData';

type UserRecord = GoogleDrivePrivateRecord & { userId: string };
export type JournalPrivateDataType = 'entries' | 'folders' | 'memories';

export const journalPrivateLocalKey = (userId: string, type: JournalPrivateDataType) =>
  `habtastic:journal-private:v1:${encodeURIComponent(userId)}:${type}`;

const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const emptySnapshot = <T extends GoogleDrivePrivateRecord>(): GoogleDrivePrivateSnapshot<T> => ({
  version: 1,
  updatedAt: new Date(0).toISOString(),
  records: [],
  deleted: {},
});

export function readJournalPrivateLocal<T extends UserRecord>(
  userId: string,
  type: JournalPrivateDataType,
  store: GoogleDrivePrivateStore<T>,
): GoogleDrivePrivateSnapshot<T> {
  if (!userId) throw new Error('A signed-in user is required.');
  const raw = localStorage.getItem(journalPrivateLocalKey(userId, type));
  if (raw === null) return emptySnapshot<T>();

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Saved Journal data is unreadable. The original device copy was preserved.');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved Journal data is invalid. The original device copy was preserved.');
  }
  const data = value as Record<string, unknown>;
  const deleted = data.deleted;
  if (
    data.version !== 1 ||
    !validDate(data.updatedAt) ||
    !Array.isArray(data.records) ||
    data.records.length > 5000 ||
    !data.records.every(record => store.validateRecord(record) && record.userId === userId) ||
    !deleted || typeof deleted !== 'object' || Array.isArray(deleted) ||
    Object.keys(deleted).length > 10000 ||
    !Object.values(deleted).every(validDate)
  ) {
    throw new Error('Saved Journal data failed validation. The original device copy was preserved.');
  }

  return {
    version: 1,
    updatedAt: data.updatedAt,
    records: data.records as T[],
    deleted: deleted as Record<string, string>,
  };
}

export function writeJournalPrivateLocal<T extends UserRecord>(
  userId: string,
  type: JournalPrivateDataType,
  store: GoogleDrivePrivateStore<T>,
  snapshot: GoogleDrivePrivateSnapshot<T>,
): void {
  if (!userId) throw new Error('A signed-in user is required.');
  if (
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.records) ||
    snapshot.records.length > 5000 ||
    !snapshot.records.every(record => store.validateRecord(record) && record.userId === userId) ||
    !snapshot.deleted || typeof snapshot.deleted !== 'object' || Array.isArray(snapshot.deleted) ||
    Object.keys(snapshot.deleted).length > 10000 ||
    !Object.values(snapshot.deleted).every(validDate)
  ) {
    throw new Error('Journal data failed validation and was not saved.');
  }

  const safeSnapshot: GoogleDrivePrivateSnapshot<T> = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: snapshot.records,
    deleted: snapshot.deleted,
  };
  localStorage.setItem(journalPrivateLocalKey(userId, type), JSON.stringify(safeSnapshot));
}


/** True only when all three collection snapshots exist for this signed-in user. */
export function hasCompleteJournalPrivateLocalSnapshot(userId: string): boolean {
  if (!userId) return false;
  return (['entries', 'folders', 'memories'] as const).every(
    type => localStorage.getItem(journalPrivateLocalKey(userId, type)) !== null,
  );
}
