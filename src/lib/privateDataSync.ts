export interface PrivateDataRecord {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface PrivateDataSnapshot<T extends PrivateDataRecord> {
  version: 1;
  updatedAt: string;
  records: T[];
  deleted: Record<string, string>;
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerIso(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return timestamp(a) >= timestamp(b) ? a : b;
}

/**
 * Generic local-first merge for user-owned private data.
 *
 * The local copy wins ties, while the newest record wins otherwise.
 * Deletion tombstones are merged by timestamp and beat records at the
 * same timestamp, preventing deleted data from reappearing on another device.
 */
export function mergePrivateDataState<T extends PrivateDataRecord>(
  localRecords: T[],
  localDeleted: Record<string, string>,
  remote: PrivateDataSnapshot<T> | null,
  getRecordTimestamp: (record: T) => string | undefined = (record) =>
    record.updatedAt || record.createdAt,
): PrivateDataSnapshot<T> {
  const byId = new Map<string, T>();

  for (const record of localRecords) {
    if (!record?.id) continue;
    byId.set(record.id, record);
  }

  for (const record of remote?.records ?? []) {
    if (!record?.id) continue;
    const existing = byId.get(record.id);
    if (
      !existing ||
      timestamp(getRecordTimestamp(record)) > timestamp(getRecordTimestamp(existing))
    ) {
      byId.set(record.id, record);
    }
  }

  const deleted: Record<string, string> = { ...(remote?.deleted ?? {}) };
  for (const [id, deletedAt] of Object.entries(localDeleted ?? {})) {
    const latest = newerIso(deleted[id], deletedAt);
    if (latest) deleted[id] = latest;
  }

  for (const [id, deletedAt] of Object.entries(deleted)) {
    const record = byId.get(id);
    if (!record) continue;
    if (timestamp(deletedAt) >= timestamp(getRecordTimestamp(record))) {
      byId.delete(id);
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: Array.from(byId.values()),
    deleted,
  };
}
