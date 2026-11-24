/** Stable error codes shared by habit save flows and Supabase's free-tier trigger. */
export const HABIT_SAVE_ERRORS = {
  FREE_LIMIT: 'free_habit_limit_reached',
  SIGN_IN_REQUIRED: 'Sign in required',
  TIMEOUT: 'habit_save_timeout',
} as const;

/** Supabase returns P0001 with this exact message from enforce_free_habit_limit(). */
export function isFreeHabitLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.message === HABIT_SAVE_ERRORS.FREE_LIMIT ||
    (value.code === 'P0001' && typeof value.message === 'string' &&
      value.message.includes(HABIT_SAVE_ERRORS.FREE_LIMIT));
}
