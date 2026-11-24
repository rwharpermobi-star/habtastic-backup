import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCoachNudge } from '@/hooks/useCoachNudge';
import type { DbHabit } from '@/hooks/useHabits';

describe('coach nudge completion dates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 30, 12));
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  it.each(['invalid', '', '2026-02-30', '2026-10-30T12:00:00Z'])(
    'ignores malformed completion %j instead of throwing or hiding inactivity', malformed => {
      const habits = [{ frequency: 'daily', completions: ['2026-10-20', malformed] } as DbHabit];
      const { result } = renderHook(() => useCoachNudge(habits, true));
      expect(result.current.nudge).toBeNull();
      act(() => vi.advanceTimersByTime(600));
      expect(result.current.nudge?.message).toBeTruthy();
      expect(localStorage.getItem('coach-nudge-inactive-2026-10-30')).toBe('1');
    },
  );

  it('handles no valid completions', () => {
    const habits = [{ frequency: 'daily', completions: ['invalid'] } as DbHabit];
    const { result } = renderHook(() => useCoachNudge(habits, true));
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.nudge?.message).toBeTruthy();
  });

  it('preserves valid activity today', () => {
    const habits = [{ frequency: 'daily', completions: ['2026-10-30', 'invalid'] } as DbHabit];
    const { result } = renderHook(() => useCoachNudge(habits, true));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.nudge).toBeNull();
  });

  it('handles no habits', () => {
    const { result } = renderHook(() => useCoachNudge([], true));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.nudge).toBeNull();
  });
});
