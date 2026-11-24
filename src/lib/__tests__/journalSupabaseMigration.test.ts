import { describe, expect, it } from 'vitest';
import { collectJournalRows } from '@/lib/journalSupabaseMigration';

describe('collectJournalRows', () => {
  it('reads all pages in order until a short page is returned', async () => {
    const calls: Array<[number, number]> = [];
    const result = await collectJournalRows(async (from, to) => {
      calls.push([from, to]);
      if (from === 0) return ['a', 'b'];
      if (from === 2) return ['c'];
      return [];
    }, 2, 10);

    expect(result).toEqual(['a', 'b', 'c']);
    expect(calls).toEqual([[0, 1], [2, 3]]);
  });

  it('stops when a collection exceeds its configured safe limit', async () => {
    await expect(collectJournalRows(async () => ['a', 'b', 'c'], 3, 2))
      .rejects.toThrow(/safe 2-record local limit/i);
  });

  it('stops if the page callback returns an invalid result', async () => {
    await expect(collectJournalRows(async () => null as unknown as unknown[], 3, 10))
      .rejects.toThrow(/not a valid list/i);
  });

  it('propagates page-read errors without pretending the migration succeeded', async () => {
    await expect(collectJournalRows(async () => {
      throw new Error('read failed');
    }, 3, 10)).rejects.toThrow('read failed');
  });
});
