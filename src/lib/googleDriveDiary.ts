import { mergePrivateDataState, type PrivateDataSnapshot } from '@/lib/privateDataSync';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Preferences } from '@capacitor/preferences';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const diaryFileName = (userId: string) => `habtastic-diary-v2-${encodeURIComponent(userId)}.json`;
export const isGoogleDriveAvailable = () => Capacitor.isNativePlatform();
const TOKEN_KEY = 'habtastic_google_drive_access_token_v1';
const TOKEN_TIME_KEY = 'habtastic_google_drive_access_token_time_v1';

// Google OAuth access tokens are normally short-lived. Keep a conservative
// local lifetime and ask the user to reconnect rather than trying to persist a
// long-lived Google credential in HabTastic/Supabase.
const TOKEN_MAX_AGE_MS = 50 * 60 * 1000;

export interface GoogleDriveDiaryEntry {
  id: string;
  title: string;
  content: string;
  entryAt: string;
  createdAt: string;
  updatedAt?: string;
  mood?: string;
}

export type DiaryDeletionMap = Record<string, string>;

export interface GoogleDriveDiarySnapshot {
  version: 1;
  updatedAt: string;
  entries: GoogleDriveDiaryEntry[];
  deleted: DiaryDeletionMap;
}

export type GoogleDriveSyncErrorCode =
  | 'not-native'
  | 'cancelled'
  | 'reconnect'
  | 'api-disabled'
  | 'request-failed'
  | 'invalid-backup';

export class GoogleDriveSyncError extends Error {
  readonly code: GoogleDriveSyncErrorCode;

  constructor(code: GoogleDriveSyncErrorCode, message: string) {
    super(message);
    this.name = 'GoogleDriveSyncError';
    this.code = code;
  }
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Unknown Google Drive error';
}

async function clearCachedToken(userId: string) {
  await Promise.all([
    Preferences.remove({ key: `${TOKEN_KEY}:${userId}` }),
    Preferences.remove({ key: `${TOKEN_TIME_KEY}:${userId}` }),
  ]);
}

export async function disconnectGoogleDriveSession(userId: string) {
  await clearCachedToken(userId);
}

export async function getCachedGoogleDriveAccessToken(userId: string): Promise<string | null> {
  const [{ value: token }, { value: issuedAtRaw }] = await Promise.all([
    Preferences.get({ key: `${TOKEN_KEY}:${userId}` }),
    Preferences.get({ key: `${TOKEN_TIME_KEY}:${userId}` }),
  ]);

  if (!token || !issuedAtRaw) return null;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0 || issuedAt > Date.now() + 60_000 || Date.now() - issuedAt > TOKEN_MAX_AGE_MS) {
    await clearCachedToken(userId);
    return null;
  }

  return token;
}

export async function connectGoogleDrive(userId: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new GoogleDriveSyncError(
      'not-native',
      'Google Drive diary sync is available in the installed HabTastic app.',
    );
  }

  try {
    const result = await FirebaseAuthentication.signInWithGoogle({
      // Drive requires a Google OAuth access token with the appData scope.
      // Use the legacy Android Google Sign-In flow rather than Credential Manager,
      // which can reject some valid configurations with error 28444.
      // Normal HabTastic account login continues through Supabase OAuth.
      useCredentialManager: false,
      skipNativeAuth: true,
      scopes: [DRIVE_SCOPE],
    });

    const token = result.credential?.accessToken;
    if (!token) {
      throw new GoogleDriveSyncError(
        'reconnect',
        'Google did not return Drive access. Please choose your Google account and allow HabTastic to save diary backups.',
      );
    }

    await Promise.all([
      Preferences.set({ key: `${TOKEN_KEY}:${userId}`, value: token }),
      Preferences.set({ key: `${TOKEN_TIME_KEY}:${userId}`, value: String(Date.now()) }),
    ]);

    return token;
  } catch (error) {
    if (error instanceof GoogleDriveSyncError) throw error;

    const raw = asErrorMessage(error);
    const lower = raw.toLowerCase();
    if (lower.includes('cancel') || lower.includes('canceled')) {
      throw new GoogleDriveSyncError('cancelled', 'Google Drive connection was cancelled.');
    }

    throw new GoogleDriveSyncError(
      'request-failed',
      `Could not connect Google Drive: ${raw}`,
    );
  }
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return (
      body?.error?.message ||
      body?.error_description ||
      body?.message ||
      `HTTP ${response.status}`
    );
  } catch {
    try {
      const text = await response.text();
      return text.trim().slice(0, 300) || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}

async function driveFetch(
  accessToken: string,
  userId: string,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch (error) {
    const raw = asErrorMessage(error);
    // Native WebView often reports network, OAuth, and API-configuration failures
    // as the same generic "Failed to fetch" TypeError. Preserve a useful stage hint.
    throw new GoogleDriveSyncError(
      'request-failed',
      `Could not reach Google Drive (${new URL(input).hostname}). Check your connection and Google Drive API/OAuth configuration. Details: ${raw}`,
    );
  }
  if (response.ok) return response;

  const message = await parseErrorResponse(response);

  if (response.status === 401) {
    await clearCachedToken(userId);
    throw new GoogleDriveSyncError(
      'reconnect',
      'Google Drive access expired. Tap the sync button to reconnect your Google account.',
    );
  }

  if (
    response.status === 403 &&
    /accessnotconfigured|service_disabled|drive api.*not.*enabled|has not been used/i.test(message)
  ) {
    throw new GoogleDriveSyncError(
      'api-disabled',
      'Google Drive API is not enabled for HabTastic yet.',
    );
  }

  throw new GoogleDriveSyncError(
    'request-failed',
    `Google Drive sync failed: ${message}`,
  );
}

interface DriveFile {
  id: string;
  name?: string;
  modifiedTime?: string;
}

async function findDiaryBackupFile(accessToken: string, userId: string): Promise<DriveFile | null> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('spaces', 'appDataFolder');
  url.searchParams.set('q', `name = '${diaryFileName(userId)}' and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '10');

  const response = await driveFetch(accessToken, userId, url.toString());
  const body = await response.json() as { files?: DriveFile[] };
  return body.files?.[0] ?? null;
}

function normalizeSnapshot(raw: unknown): GoogleDriveDiarySnapshot {
  const validEntry = (value: unknown): value is GoogleDriveDiaryEntry => {
    if (!value || typeof value !== 'object') return false;
    const e = value as Record<string, unknown>;
    return ['id', 'title', 'content', 'entryAt', 'createdAt'].every(k => typeof e[k] === 'string')
      && Number.isFinite(Date.parse(e.entryAt as string))
      && Number.isFinite(Date.parse(e.createdAt as string))
      && (e.updatedAt === undefined || (typeof e.updatedAt === 'string' && Number.isFinite(Date.parse(e.updatedAt))));
  };
  const candidate: Partial<GoogleDriveDiarySnapshot> | null = Array.isArray(raw)
    ? { version: 1, entries: raw, deleted: {} }
    : raw as Partial<GoogleDriveDiarySnapshot> | null;
  if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.entries) ||
      !candidate.entries.every(validEntry) || !candidate.deleted ||
      Array.isArray(candidate.deleted) || typeof candidate.deleted !== 'object' ||
      !Object.values(candidate.deleted).every(d => typeof d === 'string' && Number.isFinite(Date.parse(d)))) {
    throw new GoogleDriveSyncError('invalid-backup', 'The Google Drive diary backup could not be read safely. Your device copy has been kept.');
  }
  return {
    version: 1,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date(0).toISOString(),
    entries: candidate.entries,
    deleted: candidate.deleted,
  };
}

export async function readGoogleDriveDiarySnapshot(
  accessToken: string,
  userId: string,
): Promise<GoogleDriveDiarySnapshot | null> {
  const file = await findDiaryBackupFile(accessToken, userId);
  if (!file) return null;

  const response = await driveFetch(
    accessToken,
    userId,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
  );

  try {
    return normalizeSnapshot(await response.json());
  } catch (error) {
    if (error instanceof GoogleDriveSyncError) throw error;
    throw new GoogleDriveSyncError(
      'invalid-backup',
      'The Google Drive diary backup could not be read.',
    );
  }
}

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `habtastic_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function writeGoogleDriveDiarySnapshot(
  accessToken: string,
  userId: string,
  snapshot: GoogleDriveDiarySnapshot,
): Promise<void> {
  const file = await findDiaryBackupFile(accessToken, userId);
  const payload = JSON.stringify(snapshot);

  if (file) {
    await driveFetch(
      accessToken,
      userId,
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: payload,
      },
    );
    return;
  }

  const boundary = randomBoundary();
  const metadata = JSON.stringify({
    name: diaryFileName(userId),
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  });
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    metadata +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    payload +
    `\r\n--${boundary}--`;

  await driveFetch(
    accessToken,
    userId,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
}

export function mergeGoogleDriveDiaryState(
  localEntries: GoogleDriveDiaryEntry[],
  localDeleted: DiaryDeletionMap,
  remote: GoogleDriveDiarySnapshot | null,
): GoogleDriveDiarySnapshot {
  const merged = mergePrivateDataState(
    localEntries,
    localDeleted,
    remote
      ? {
          version: 1,
          updatedAt: remote.updatedAt,
          records: remote.entries,
          deleted: remote.deleted,
        }
      : null,
    (entry) => entry.updatedAt || entry.createdAt || entry.entryAt,
  );

  return {
    version: 1,
    updatedAt: merged.updatedAt,
    entries: merged.records,
    deleted: merged.deleted,
  };
}
