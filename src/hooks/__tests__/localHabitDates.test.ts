import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConsistencyScore } from '@/hooks/useConsistencyScore';
import type { DbHabit } from '@/hooks/useHabits';
import { formatLocalDate, todayStr } from '@/lib/habitStore';
import { getDayStatus } from '@/lib/habitStatus';

const state = vi.hoisted(() => ({ habits: [] as DbHabit[] }));
vi.mock('@/hooks/useHabits', () => ({ useHabits: () => ({ habits: state.habits }) }));

describe('local habit dates', () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'Africa/Johannesburg';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T22:30:00Z'));
    state.habits = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it('uses October 31 at midnight in UTC+2 and keeps a two-day streak', () => {
    expect(todayStr()).toBe('2026-10-31');
    expect(formatLocalDate(new Date('2026-10-29T22:30:00Z'))).toBe('2026-10-30');
    state.habits = [{ completions: ['2026-10-30', '2026-10-31'] } as DbHabit];
    const { result } = renderHook(useConsistencyScore);
    expect(result.current.bestStreak).toBe(2);
    expect(result.current.todayCompleted).toBe(1);
    expect(getDayStatus('2026-10-31', 1, 1)).toBe('completed');
    expect(getDayStatus('2026-10-31', 0, 1)).toBe('today');
    expect(getDayStatus('2026-11-01', 0, 1)).toBe('future');
  });

  it('handles an empty habit list', () => {
    const { result } = renderHook(useConsistencyScore);
    expect(result.current.bestStreak).toBe(0);
    expect(result.current.todayTotal).toBe(0);
    expect(getDayStatus(todayStr(), 0, 0)).toBe('today');
  });

  it('rejects invalid dates', () => {
    expect(() => formatLocalDate(new Date('invalid'))).toThrow(RangeError);
  });
});
