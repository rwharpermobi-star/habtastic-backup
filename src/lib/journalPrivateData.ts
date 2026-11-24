import type { GoogleDrivePrivateRecord, GoogleDrivePrivateStore } from '@/lib/googleDrivePrivateData';

export interface JournalPrivateEntry extends GoogleDrivePrivateRecord {
  userId: string;
  content: string;
  mood: string;
  moodIntensity: number;
  topics: string[];
  aiFeedback: string | null;
  isVoice: boolean;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalPrivateFolder extends GoogleDrivePrivateRecord {
  userId: string;
  name: string;
  emoji: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalPrivateMemory extends GoogleDrivePrivateRecord {
  userId: string;
  memoryType: string;
  content: string;
  relevanceScore: number;
  createdAt: string;
  updatedAt: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function isJournalPrivateEntry(value: unknown): value is JournalPrivateEntry {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.content === 'string' &&
    typeof value.mood === 'string' &&
    typeof value.moodIntensity === 'number' &&
    Number.isFinite(value.moodIntensity) &&
    Array.isArray(value.topics) &&
    value.topics.every(topic => typeof topic === 'string') &&
    (typeof value.aiFeedback === 'string' || value.aiFeedback === null) &&
    typeof value.isVoice === 'boolean' &&
    (typeof value.folderId === 'string' || value.folderId === null) &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt)
  );
}

export function isJournalPrivateFolder(value: unknown): value is JournalPrivateFolder {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.emoji === 'string' &&
    typeof value.color === 'string' &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt)
  );
}

export function isJournalPrivateMemory(value: unknown): value is JournalPrivateMemory {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.memoryType === 'string' &&
    typeof value.content === 'string' &&
    typeof value.relevanceScore === 'number' &&
    Number.isFinite(value.relevanceScore) &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt)
  );
}

export const journalPrivateEntryStore: GoogleDrivePrivateStore<JournalPrivateEntry> = {
  fileName: userId => `habtastic-journal-entries-v1-${encodeURIComponent(userId)}.json`,
  validateRecord: isJournalPrivateEntry,
};

export const journalPrivateFolderStore: GoogleDrivePrivateStore<JournalPrivateFolder> = {
  fileName: userId => `habtastic-journal-folders-v1-${encodeURIComponent(userId)}.json`,
  validateRecord: isJournalPrivateFolder,
};

export const journalPrivateMemoryStore: GoogleDrivePrivateStore<JournalPrivateMemory> = {
  fileName: userId => `habtastic-journal-memories-v1-${encodeURIComponent(userId)}.json`,
  validateRecord: isJournalPrivateMemory,
};
