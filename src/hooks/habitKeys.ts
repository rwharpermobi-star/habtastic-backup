/**
 * Query keys for habit data.
 *
 * Kept in its own dependency-free module so eager-startup code (warm start)
 * can reference the key without statically importing `useHabits` — which pulls
 * in the Supabase client, sfx and the offline outbox.
 */
export const habitsQueryKey = (userId: string | undefined) => ['habits', userId] as const;
