import {
  journalPrivateEntryStore,
  journalPrivateFolderStore,
  journalPrivateMemoryStore,
  type JournalPrivateEntry,
  type JournalPrivateFolder,
  type JournalPrivateMemory,
} from '@/lib/journalPrivateData';
import {
  hasCompleteJournalPrivateLocalSnapshot,
  readJournalPrivateLocal,
  writeJournalPrivateLocal,
} from '@/lib/journalPrivateStorage';

const now = () => new Date().toISOString();

export function readLocalJournalEntries(userId: string) {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return null;
  return readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore).records
    .map((entry): JournalEntryShape => ({
      id: entry.id,
      user_id: userId,
      content: entry.content,
      mood: entry.mood,
      mood_intensity: entry.moodIntensity,
      topics: entry.topics,
      ai_feedback: entry.aiFeedback,
      is_voice: entry.isVoice,
      folder_id: entry.folderId,
      created_at: entry.createdAt,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface JournalEntryShape {
  id: string;
  user_id: string;
  content: string;
  mood: string;
  mood_intensity: number;
  topics: string[];
  ai_feedback: string | null;
  is_voice: boolean;
  folder_id?: string | null;
  created_at: string;
}

export interface JournalMemoryShape {
  id: string;
  user_id: string;
  memory_type: string;
  content: string;
  relevance_score: number;
  created_at: string;
}

export function readLocalJournalMemories(userId: string): JournalMemoryShape[] | null {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return null;
  return readJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore).records
    .map(memory => ({
      id: memory.id,
      user_id: userId,
      memory_type: memory.memoryType,
      content: memory.content,
      relevance_score: memory.relevanceScore,
      created_at: memory.createdAt,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface JournalFolderShape {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  created_at: string;
}

export function readLocalJournalFolders(userId: string): JournalFolderShape[] | null {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return null;
  return readJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore).records
    .map(folder => ({
      id: folder.id,
      user_id: userId,
      name: folder.name,
      emoji: folder.emoji,
      color: folder.color,
      created_at: folder.createdAt,
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function upsertLocalJournalEntry(userId: string, entry: JournalEntryShape): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const state = readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore);
  const record: JournalPrivateEntry = {
    id: entry.id,
    userId,
    content: entry.content,
    mood: entry.mood,
    moodIntensity: entry.mood_intensity,
    topics: entry.topics || [],
    aiFeedback: entry.ai_feedback ?? null,
    isVoice: entry.is_voice,
    folderId: entry.folder_id ?? null,
    createdAt: entry.created_at,
    updatedAt: now(),
  };
  writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, {
    ...state,
    updatedAt: now(),
    records: [...state.records.filter(item => item.id !== entry.id), record],
    deleted: Object.fromEntries(Object.entries(state.deleted).filter(([id]) => id !== entry.id)),
  });
}

export function deleteLocalJournalEntry(userId: string, entryId: string): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const state = readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore);
  const deleted = { ...state.deleted, [entryId]: now() };
  writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, {
    ...state,
    updatedAt: now(),
    records: state.records.filter(item => item.id !== entryId),
    deleted,
  });
}

export function upsertLocalJournalFolder(userId: string, folder: JournalFolderShape): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const state = readJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore);
  const record: JournalPrivateFolder = {
    id: folder.id, userId, name: folder.name, emoji: folder.emoji, color: folder.color,
    createdAt: folder.created_at, updatedAt: now(),
  };
  writeJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore, {
    ...state,
    updatedAt: now(),
    records: [...state.records.filter(item => item.id !== folder.id), record],
    deleted: Object.fromEntries(Object.entries(state.deleted).filter(([id]) => id !== folder.id)),
  });
}

export function deleteLocalJournalFolder(userId: string, folderId: string): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const timestamp = now();
  const state = readJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore);
  writeJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore, {
    ...state,
    updatedAt: timestamp,
    records: state.records.filter(item => item.id !== folderId),
    deleted: { ...state.deleted, [folderId]: timestamp },
  });

  // Keep entries valid when their folder is removed from the local snapshot.
  const entries = readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore);
  writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, {
    ...entries,
    updatedAt: timestamp,
    records: entries.records.map(item =>
      item.folderId === folderId ? { ...item, folderId: null, updatedAt: timestamp } : item
    ),
  });
}

export function moveLocalJournalEntry(userId: string, entryId: string, folderId: string | null): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const state = readJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore);
  const existing = state.records.find(item => item.id === entryId);
  if (!existing) return;
  const updatedAt = now();
  writeJournalPrivateLocal(userId, 'entries', journalPrivateEntryStore, {
    ...state,
    updatedAt,
    records: state.records.map(item => item.id === entryId ? { ...item, folderId, updatedAt } : item),
  });
}

export function updateLocalJournalFolderName(userId: string, folderId: string, name: string): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const state = readJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore);
  const updatedAt = now();
  writeJournalPrivateLocal(userId, 'folders', journalPrivateFolderStore, {
    ...state,
    updatedAt,
    records: state.records.map(item => item.id === folderId ? { ...item, name, updatedAt } : item),
  });
}

export function upsertLocalJournalMemory(userId: string, memory: JournalMemoryShape): void {
  if (!hasCompleteJournalPrivateLocalSnapshot(userId)) return;
  const state = readJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore);
  const record: JournalPrivateMemory = {
    id: memory.id, userId, memoryType: memory.memory_type, content: memory.content,
    relevanceScore: memory.relevance_score, createdAt: memory.created_at, updatedAt: now(),
  };
  writeJournalPrivateLocal(userId, 'memories', journalPrivateMemoryStore, {
    ...state,
    updatedAt: now(),
    records: [...state.records.filter(item => item.id !== memory.id), record],
    deleted: Object.fromEntries(Object.entries(state.deleted).filter(([id]) => id !== memory.id)),
  });
}
