import { useCallback, useMemo } from 'react';
import { usePersistedState } from './usePersistedState';
import type { DbHabit } from './useHabits';

const STORAGE_KEY = 'habtastic.habits.order.v1';

/**
 * Client-side ordering for the Habits page.
 * Stores a plain string[] of habit IDs in localStorage.
 * Backend schema is untouched.
 */
export function useHabitOrder(habits: DbHabit[]) {
  const [orderIds, setOrderIds] = usePersistedState<string[]>(STORAGE_KEY, []);

  // Reconcile stored order with current habits: keep known IDs in order,
  // drop deleted ones, append new ones at the end.
  const reconciled = useMemo(() => {
    const known = new Set(habits.map(h => h.id));
    const kept = orderIds.filter(id => known.has(id));
    const missing = habits.map(h => h.id).filter(id => !kept.includes(id));
    return [...kept, ...missing];
  }, [orderIds, habits]);

  const orderedHabits = useMemo(() => {
    const byId = new Map(habits.map(h => [h.id, h]));
    return reconciled.map(id => byId.get(id)).filter((h): h is DbHabit => !!h);
  }, [reconciled, habits]);

  /**
   * Replace the positions occupied by `sectionIds` (in current global order)
   * with the new `newSectionIds` order. Preserves positions of other habits.
   */
  const reorderInSection = useCallback((sectionIds: string[], newSectionIds: string[]) => {
    setOrderIds(prev => {
      const base = prev.length ? prev : habits.map(h => h.id);
      const sectionPositions: number[] = [];
      base.forEach((id, i) => { if (sectionIds.includes(id)) sectionPositions.push(i); });
      const next = base.slice();
      sectionPositions.forEach((pos, i) => { next[pos] = newSectionIds[i]; });
      return next;
    });
  }, [habits, setOrderIds]);

  return { orderedHabits, reorderInSection };
}
