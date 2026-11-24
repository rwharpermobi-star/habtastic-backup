import { describe, expect, it } from 'vitest';
import { formatLocalDate, parseLocalDate, isLocalDate } from '@/lib/habitStore';

describe('parseLocalDate', () => {
  it('keeps October 30 on Friday in the local timezone', () => {
    const date = parseLocalDate('2026-10-30');
    expect(date.getDay()).toBe(5);
    expect(date.getHours()).toBe(0);
    expect(date.toLocaleDateString('en-US', { weekday: 'long' })).toBe('Friday');
    expect(formatLocalDate(date)).toBe('2026-10-30');
  });

  it.each(['', 'invalid', '2026-02-30', '2026-13-01', '2026-10-30T00:00:00Z'])(
    'rejects invalid local date %j', str => {
      expect(() => parseLocalDate(str)).toThrow(RangeError);
    },
  );

  it('ignores malformed completions before parsing local dates', () => {
    const completions = ['2026-10-30', '', 'invalid', '2026-02-30', '2026-10-30T00:00:00Z'];
    const dates = completions.filter(isLocalDate).map(parseLocalDate);
    expect(dates.map(formatLocalDate)).toEqual(['2026-10-30']);
    expect(dates[0].getDay()).toBe(5);
    expect([].filter(isLocalDate).map(parseLocalDate)).toEqual([]);
  });
});
