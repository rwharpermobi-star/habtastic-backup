import { describe, expect, it } from 'vitest';
import type { GoogleDrivePrivateRecord, GoogleDrivePrivateSnapshot } from '@/lib/googleDrivePrivateData';

type TestRecord = GoogleDrivePrivateRecord & {
  value: string;
};

const store = {
  fileName: (userId: string) => `habtastic-test-${userId}.json`,
  validateRecord: (value: unknown): value is TestRecord => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string' && typeof record.value === 'string';
  },
};

describe('googleDrivePrivateData contract', () => {
  it('uses appDataFolder-compatible store metadata', () => {
    expect(store.fileName('user-123')).toBe('habtastic-test-user-123.json');
  });

  it('accepts valid private records', () => {
    const record: TestRecord = {
      id: 'entry-1',
      value: 'private',
      updatedAt: '2026-10-08T20:00:00.000Z',
    };

    expect(store.validateRecord(record)).toBe(true);
  });

  it('rejects malformed private records', () => {
    expect(store.validateRecord({ id: 'entry-1', value: 123 })).toBe(false);
    expect(store.validateRecord(null)).toBe(false);
  });

  it('keeps the snapshot contract versioned', () => {
    const snapshot: GoogleDrivePrivateSnapshot<TestRecord> = {
      version: 1,
      updatedAt: '2026-10-08T20:00:00.000Z',
      records: [{ id: 'entry-1', value: 'private' }],
      deleted: {},
    };

    expect(snapshot.version).toBe(1);
    expect(snapshot.records).toHaveLength(1);
  });
});
