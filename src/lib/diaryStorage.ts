export interface DiaryEntry {
  id: string;
  title: string;
  content: string;
  entryAt: string;
  createdAt: string;
  updatedAt?: string;
  mood?: string;
}

export interface DiaryStore {
  entries: DiaryEntry[];
  pending: string[];
  deleted: string[];
  knownCloudIds: string[];
  tombstones: Record<string, string>;
  cloudSync: boolean;
  importedLegacy: boolean;
}

const LEGACY_KEY = 'habtastic_diary_entries_v1';
export const diaryStorageKey = (userId: string) => `habtastic_diary_v2:${userId}`;

const isEntry = (e: unknown): e is DiaryEntry => {
  if (!e || typeof e !== 'object') return false;
  const r = e as Record<string, unknown>;
  return ['id', 'title', 'content', 'entryAt', 'createdAt'].every(k => typeof r[k] === 'string');
};

export function readDiary(userId: string): DiaryStore {
  const raw = localStorage.getItem(diaryStorageKey(userId));
  if (!raw) return { entries: [], pending: [], deleted: [], knownCloudIds: [], tombstones: {}, cloudSync: false, importedLegacy: false };
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.entries) || !parsed.entries.every(isEntry) ||
      !['pending', 'deleted', 'knownCloudIds'].every(k => Array.isArray(parsed[k]) && parsed[k].every((id: unknown) => typeof id === 'string'))) {
    throw new Error('The saved diary could not be read. Its device copy has been kept.');
  }
  return { ...parsed, tombstones: parsed.tombstones ?? {} };
}

export function writeDiary(userId: string, store: DiaryStore) {
  localStorage.setItem(diaryStorageKey(userId), JSON.stringify(store));
}

// The old store has no owner. Never silently upload it into the current account.
export function readLegacyDiary(): DiaryEntry[] {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) && parsed.every(isEntry) ? parsed : [];
}
