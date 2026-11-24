import { useCallback, useRef, useState } from "react";
import { logError } from "@/lib/logger";

/**
 * Wraps an async action with built-in double-submit prevention and error logging.
 *
 * Returns:
 *  - `run` — invoke the action. Re-entrant calls while in-flight are silently dropped.
 *  - `loading` — true while the wrapped action is in-flight (drive disabled buttons).
 *  - `error` — last error message (or null).
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: { category?: Parameters<typeof logError>[0]; label?: string },
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        logError(options?.category ?? "app", options?.label ?? "async action failed", e);
        throw e;
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [fn, options?.category, options?.label],
  );

  return { run, loading, error };
}
