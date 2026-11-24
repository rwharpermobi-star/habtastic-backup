import { formatLocalDate } from '@/lib/habitStore';
import { useMemo } from 'react';
import { useHabits, type DbHabit } from '@/hooks/useHabits';

function dateNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

function wasDueOn(habit: DbHabit, dayOfWeek: number): boolean {
  if (habit.frequency === 'daily' || habit.frequency === 'weekly') return true;
  if (habit.frequency === 'custom') return (habit.custom_days || []).includes(dayOfWeek);
  return true;
}

export interface MissedHabit {
  habit: DbHabit;
  missedDate: string;
}

/**
 * Detect habits the user missed yesterday — used by Winston's
 * supportive Missed Habit Recovery card. No guilt-based logic.
 */
export function useMissedHabits(): { missed: MissedHabit[]; loading: boolean } {
  const { habits, loading } = useHabits();

  const missed = useMemo(() => {
    const yesterday = dateNDaysAgo(1);
    const dow = new Date(yesterday + 'T00:00:00').getDay();
    return habits
      .filter(h => wasDueOn(h, dow) && !h.completions.includes(yesterday))
      .map(h => ({ habit: h, missedDate: yesterday }));
  }, [habits]);

  return { missed, loading };
}
