import { Capacitor } from '@capacitor/core';
import {
  GoogleDriveSyncError,
  connectGoogleDrive,
  disconnectGoogleDriveSession,
  getCachedGoogleDriveAccessToken,
} from '@/lib/googleDriveDiary';

export interface GoogleDrivePrivateRecord {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface GoogleDrivePrivateSnapshot<T extends GoogleDrivePrivateRecord> {
  version: 1;
  updatedAt: string;
  records: T[];
  deleted: Record<string, string>;
}

export interface GoogleDrivePrivateStore<T extends GoogleDrivePrivateRecord> {
  fileName: (userId: string) => string;
  validateRecord: (value: unknown) => value is T;
}

export const isGoogleDrivePrivateDataAvailable = () => Capacitor.isNativePlatform();

function randomBoundary(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `habtastic_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message || body?.error_description || body?.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
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
  const response = await fetch(input, { ...init, headers });
  if (response.ok) return response;

  const message = await parseErrorResponse(response);
  if (response.status === 401) {
    await disconnectGoogleDriveSession(userId);
    throw new GoogleDriveSyncError(
      'reconnect',
      'Google Drive access expired. Tap the sync button to reconnect your Google account.',
    );
  }
  if (response.status === 403 && /accessnotconfigured|service_disabled|drive api.*not.*enabled|has not been used/i.test(message)) {
    throw new GoogleDriveSyncError('api-disabled', 'Google Drive API is not enabled for HabTastic yet.');
  }
  throw new GoogleDriveSyncError('request-failed', `Google Drive sync failed: ${message}`);
}

async function findFile<T extends GoogleDrivePrivateRecord>(
  accessToken: string,
  userId: string,
  store: GoogleDrivePrivateStore<T>,
): Promise<{ id: string } | null> {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('spaces', 'appDataFolder');
  url.searchParams.set('q', `name = '${store.fileName(userId)}' and trashed = false`);
  url.searchParams.set('fields', 'files(id,name,modifiedTime)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', '10');

  const response = await driveFetch(accessToken, userId, url.toString());
  const body = await response.json() as { files?: Array<{ id: string }> };
  return body.files?.[0] ?? null;
}

function normalizeSnapshot<T extends GoogleDrivePrivateRecord>(
  raw: unknown,
  store: GoogleDrivePrivateStore<T>,
): GoogleDrivePrivateSnapshot<T> {
  const candidate = raw as Partial<GoogleDrivePrivateSnapshot<T>> | null;
  if (
    !candidate ||
    candidate.version !== 1 ||
    !Array.isArray(candidate.records) ||
    candidate.records.length > 5000 ||
    !candidate.records.every(store.validateRecord) ||
    !candidate.deleted ||
    Array.isArray(candidate.deleted) ||
    typeof candidate.deleted !== 'object' ||
    Object.keys(candidate.deleted).length > 10000 ||
    !Object.values(candidate.deleted).every(
      value => typeof value === 'string' && Number.isFinite(Date.parse(value)),
    )
  ) {
    throw new GoogleDriveSyncError(
      'invalid-backup',
      'The Google Drive private-data backup could not be read safely. Your device copy has been kept.',
    );
  }

  return {
    version: 1,
    updatedAt:
      typeof candidate.updatedAt === 'string' && Number.isFinite(Date.parse(candidate.updatedAt))
        ? candidate.updatedAt
        : new Date(0).toISOString(),
    records: candidate.records,
    deleted: candidate.deleted,
  };
}

export async function readGoogleDrivePrivateSnapshot<T extends GoogleDrivePrivateRecord>(
  accessToken: string,
  userId: string,
  store: GoogleDrivePrivateStore<T>,
): Promise<GoogleDrivePrivateSnapshot<T> | null> {
  const file = await findFile(accessToken, userId, store);
  if (!file) return null;

  const response = await driveFetch(
    accessToken,
    userId,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
  );

  try {
    return normalizeSnapshot(await response.json(), store);
  } catch (error) {
    if (error instanceof GoogleDriveSyncError) throw error;
    throw new GoogleDriveSyncError('invalid-backup', 'The Google Drive private-data backup could not be read.');
  }
}

export async function deleteGoogleDrivePrivateSnapshot<T extends GoogleDrivePrivateRecord>(
  accessToken: string,
  userId: string,
  store: GoogleDrivePrivateStore<T>,
): Promise<void> {
  const file = await findFile(accessToken, userId, store);
  if (!file) return;

  await driveFetch(
    accessToken,
    userId,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`,
    { method: 'DELETE' },
  );
}

export async function writeGoogleDrivePrivateSnapshot<T extends GoogleDrivePrivateRecord>(
  accessToken: string,
  userId: string,
  store: GoogleDrivePrivateStore<T>,
  snapshot: GoogleDrivePrivateSnapshot<T>,
): Promise<void> {
  const file = await findFile(accessToken, userId, store);
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
    name: store.fileName(userId),
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
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

export async function getPrivateDataAccessToken(userId: string): Promise<string | null> {
  return getCachedGoogleDriveAccessToken(userId);
}

export async function connectPrivateDataDrive(userId: string): Promise<string> {
  return connectGoogleDrive(userId);
}
