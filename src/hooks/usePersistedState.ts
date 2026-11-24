import { useEffect, useState } from 'react';

/**
 * useState-shaped hook that mirrors its value into localStorage.
 * SSR-safe: reads from storage only after mount, then syncs on change.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage once
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed */
    }
    setHydrated(true);
  }, [key]);

  // Persist after hydration
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or private mode */
    }
  }, [key, value, hydrated]);

  return [value, setValue];
}
