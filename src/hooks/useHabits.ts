import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePremium } from '@/hooks/usePremium';
import { partitionByFreeLimit } from '@/lib/featureGating';
import { HABIT_SAVE_ERRORS, isFreeHabitLimitError } from '@/lib/habitErrors';
import { playHabitComplete } from '@/lib/sfx';
import { vibrateSuccess } from '@/lib/haptics';
import { todayStr } from '@/lib/habitStore';
import { toast } from 'sonner';
import { profileQueryKey } from '@/hooks/profileCache';
import {
  cacheHabitsSnapshot,
  readHabitsSnapshot,
  enqueueCompletion,
  installOutboxAutoFlush,
  flushOutbox,
  isOnline,
  applyPendingCompletions,
  pendingCompletion,
  hasLegacyOutbox,
} from '@/lib/offlineOutbox';


const LAST_ACTIVE_THROTTLE_MS = 10 * 60 * 1000;
const lastActiveBumpAt = new Map<string, number>();
// Ignore stale responses from older attempts of the same draft in this app session.
const latestDraftSaveAttempt = new Map<string, number>();
let nextDraftSaveAttempt = 0;
function maybeBumpLastActive(userId: string) {
  const now = Date.now();
  const prev = lastActiveBumpAt.get(userId) ?? 0;
  if (now - prev < LAST_ACTIVE_THROTTLE_MS) return;
  lastActiveBumpAt.set(userId, now);
  untypedSupabase
    .from('profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', userId)
    .then(() => {});
}

export interface DbHabit {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: string;
  category: string;
  difficulty: string;
  reminder_time: string | null;
  reminder_enabled: boolean;
  reminder_tone: string;
  custom_days: number[];
  completions: string[];
  completion_revision?: number;
  sound_mode: string;
  verification_enabled?: boolean;
  verification_question?: string | null;
  created_at: string;
}

export { habitsQueryKey } from '@/hooks/habitKeys';
import { habitsQueryKey } from '@/hooks/habitKeys';
import { untypedSupabase } from "@/integrations/supabase/untyped";

const HABIT_FIELDS = 'id, user_id, name, emoji, color, frequency, category, difficulty, reminder_time, reminder_enabled, reminder_tone, custom_days, completions, completion_revision, sound_mode, verification_enabled, verification_question, created_at';

export function useHabits() {
  const { user } = useAuth();
  const { isPremium, FREE_HABIT_LIMIT, premiumProgressLocked } = usePremium();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const queryKey = habitsQueryKey(userId);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!userId) return [];
      // Never block the first server read on the offline outbox. A stale
      // completion revision or a slow RPC must not hold Home/Progress behind
      // a queue of writes. The mounted outbox worker syncs in the background.
      const { data, error } = await supabase
        .from('habits')
        .select(HABIT_FIELDS)
        .eq('user_id', userId)
        .order('created_at')
        .order('id');
      if (error) throw error;
      const rows = (data ?? []) as DbHabit[];
      const merged = applyPendingCompletions(userId, rows);
      cacheHabitsSnapshot(userId, merged);
      return merged;
    },
    enabled: !!userId,
    initialData: () => (userId
      ? applyPendingCompletions(userId, readHabitsSnapshot<DbHabit[]>(userId) ?? [])
      : undefined),
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const removeAutoFlush = installOutboxAutoFlush(userId);
    const onFlushed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId !== userId) return;
      // Replayed operation receipts can contain XP already in the balance.
      // Read the authoritative total; never add a receipt delta in the app.
      void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId), exact: true });
      void refetch();
    };
    const onConflict = () => {
      toast.warning('A newer habit update exists. Your offline change is still saved on this device for review.');
      // Refresh the server revision. The conflicted queue item is blocked, so
      // this refetch cannot re-submit the same stale event.
      void refetch();
    };
    window.addEventListener('habtastic:outbox-flushed', onFlushed);
    window.addEventListener('habtastic:outbox-conflict', onConflict);
    if (hasLegacyOutbox()) {
      toast.warning('Older offline progress needs review. It has been kept on this device and will not overwrite newer progress.');
    }
    return () => {
      removeAutoFlush();
      window.removeEventListener('habtastic:outbox-flushed', onFlushed);
      window.removeEventListener('habtastic:outbox-conflict', onConflict);
    };
  }, [userId, refetch, queryClient]);

  useEffect(() => {
    if (userId && isPremium) void flushOutbox(userId);
  }, [userId, isPremium]);

  const allHabits: DbHabit[] = data ?? [];
  // Free users keep every saved habit, but only the first FREE_HABIT_LIMIT
  // (stable created_at order from the query) remains active. Nothing is
  // deleted when a trial/payment ends; upgrading exposes the same rows again.
  const { active: habits, locked: lockedHabits } = partitionByFreeLimit(
    allHabits,
    isPremium,
    FREE_HABIT_LIMIT,
  );
  const lockedHabitIds = new Set(lockedHabits.map(h => h.id));
  const isHabitLocked = (id: string) => lockedHabitIds.has(id);
  const loading = !userId ? false : isLoading;

  const readHabits = useCallback(
    () => queryClient.getQueryData<DbHabit[]>(queryKey) ?? [],
    [queryClient, queryKey],
  );

  const writeHabits = useCallback(
    (next: DbHabit[]) => {
      queryClient.setQueryData(queryKey, next);
      if (userId) cacheHabitsSnapshot(userId, next);
    },
    [queryClient, queryKey, userId],
  );

  const addHabit = useCallback(async (
    habit: Omit<DbHabit, 'id' | 'user_id' | 'created_at' | 'completions'> & { id?: string },
  ) => {
    if (!userId) throw new Error(HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED);
    const habitId = habit.id;
    const draftKey = habitId ? `${userId}:${habitId}` : null;
    const attempt = draftKey ? ++nextDraftSaveAttempt : 0;
    if (draftKey) latestDraftSaveAttempt.set(draftKey, attempt);
    const isLatestAttempt = () => !draftKey || latestDraftSaveAttempt.get(draftKey) === attempt;
    const patch = {
      name: habit.name,
      emoji: habit.emoji,
      color: habit.color,
      frequency: habit.frequency,
      category: habit.category,
      difficulty: habit.difficulty,
      reminder_time: habit.reminder_time,
      reminder_enabled: habit.reminder_enabled,
      reminder_tone: habit.reminder_tone,
      custom_days: habit.custom_days ?? [],
      sound_mode: habit.sound_mode,
      verification_enabled: habit.verification_enabled,
      verification_question: habit.verification_question,
    };
    const rememberSavedHabit = (saved: DbHabit) => {
      // An earlier timed-out call must not overwrite a later retry's UI state.
      if (!isLatestAttempt()) return saved;
      const current = readHabits();
      writeHabits(current.some(item => item.id === saved.id)
        ? current.map(item => item.id === saved.id ? saved : item)
        : [...current, saved]);
      return saved;
    };
    const lookupExisting = async (): Promise<DbHabit | null> => {
      if (!habitId) return null;
      const { data: existing, error: lookupError } = await untypedSupabase
        .from('habits').select(HABIT_FIELDS)
        .eq('id', habitId).eq('user_id', userId).maybeSingle();
      if (lookupError) throw lookupError;
      return (existing ?? null) as DbHabit | null;
    };
    const updateExistingDraft = async (existing: DbHabit): Promise<DbHabit> => {
      // Don't let an older attempt overwrite changes submitted by a newer one.
      if (!isLatestAttempt()) return existing;
      // Update only editable draft fields. Never overwrite completions, ID,
      // owner or created_at from a retry. A locked Premium row is enforced
      // by the existing database write policies/triggers.
      const { data: saved, error: updateError } = await untypedSupabase
        .from('habits').update(patch)
        .eq('id', existing.id).eq('user_id', userId)
        .select(HABIT_FIELDS).single();
      if (updateError) throw updateError;
      if (!saved) throw new Error('Habit update returned no data');
      return rememberSavedHabit(saved as DbHabit);
    };

    // Retry of a timed-out draft: the first INSERT might already have
    // committed, including the last available free-tier slot. In that case
    // apply the CURRENT form values instead of returning stale saved values.
    if (habitId) {
      const existing = await lookupExisting();
      if (existing) return updateExistingDraft(existing);
    }
    if (!isPremium && readHabits().length >= FREE_HABIT_LIMIT) {
      throw new Error(HABIT_SAVE_ERRORS.FREE_LIMIT);
    }

    const { data, error } = await untypedSupabase.from('habits').insert({
      ...patch,
      ...(habitId ? { id: habitId } : {}),
      user_id: userId,
      completions: [],
    }).select(HABIT_FIELDS).single();

    if (error) {
      // Includes duplicate-key (23505) and a free-limit trigger (P0001)
      // when another timed-out request has just inserted this same draft.
      if (habitId && (error.code === '23505' || isFreeHabitLimitError(error))) {
        const existing = await lookupExisting();
        if (existing) return updateExistingDraft(existing);
      }
      if (isFreeHabitLimitError(error)) {
        throw new Error(HABIT_SAVE_ERRORS.FREE_LIMIT);
      }
      throw error;
    }
    if (!data) throw new Error('Habit creation returned no data');
    return rememberSavedHabit(data as DbHabit);
  }, [userId, isPremium, FREE_HABIT_LIMIT, readHabits, writeHabits]);

  const toggleCompletion = useCallback(async (habitId: string, options?: { silent?: boolean }) => {
    const current = readHabits();
    const habit = current.find(h => h.id === habitId);
    if (!habit || !userId) return false;
    if (!isPremium) {
      const allowedIds = new Set(current.slice(0, FREE_HABIT_LIMIT).map(h => h.id));
      if (!allowedIds.has(habitId)) {
        if (!options?.silent) toast('🔒 This habit is saved. Upgrade to Premium to continue it.');
        return false;
      }
    }
    // Only revisions actually obtained from the server are safe baselines.
    if (!Number.isSafeInteger(habit.completion_revision)) {
      if (!options?.silent) toast.error('Connect to the internet and refresh your habits before saving offline.');
      return false;
    }
    const today = todayStr();
    const previousPending = pendingCompletion(userId, habitId, today);
    const done = habit.completions.includes(today);
    const nextDone = !done;
    const newCompletions = nextDone
      ? [...habit.completions, today]
      : habit.completions.filter(d => d !== today);
    // Durable enqueue happens FIRST: if local storage fails, no false success.
    const savedLocally = enqueueCompletion({
      userId, id: habitId, date: today, completed: nextDone,
      expectedRevision: previousPending && !previousPending.conflicted
        ? previousPending.expectedRevision
        : habit.completion_revision!,
    });
    if (!savedLocally) {
      if (!options?.silent) toast.error('Could not save offline. Check your device storage and try again.');
      return false;
    }
    writeHabits(current.map(h => h.id === habitId ? { ...h, completions: newCompletions } : h));
    const silent = options?.silent ?? false;
    if (!isOnline()) {
      if (!silent) toast('📴 Saved on this device — will sync when connected.');
    } else {
      const synced = await flushOutbox(userId);
      // A different habit may have synced while this particular tap remains
      // queued. The batch count is not confirmation of this completion.
      if (pendingCompletion(userId, habitId, today) && !silent) {
        toast('Saved on this device. Sync will retry when connected.');
      }
      if (synced) maybeBumpLastActive(userId);
    }
    if (nextDone && !silent) {
      playHabitComplete();
      vibrateSuccess();
    }
    return nextDone;
  }, [readHabits, writeHabits, userId, isPremium, FREE_HABIT_LIMIT]);

  const updateHabit = useCallback(async (id: string, updates: Partial<Omit<DbHabit, 'id' | 'user_id' | 'created_at'>>) => {
    if (!userId) throw new Error(HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED);
    if (!isPremium) {
      const allowedIds = new Set(readHabits().slice(0, FREE_HABIT_LIMIT).map(h => h.id));
      if (!allowedIds.has(id)) {
        toast('🔒 This habit is saved. Upgrade to Premium to edit or continue it.');
        throw new Error('Premium required to edit this habit');
      }
    }
    const { data, error } = await untypedSupabase.from('habits').update(updates).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    if (!data) throw new Error('Habit update returned no data');
    writeHabits(readHabits().map(h => h.id === id ? (data as DbHabit) : h));
    return data as DbHabit;
  }, [readHabits, writeHabits, isPremium, FREE_HABIT_LIMIT, userId]);

  const deleteHabit = useCallback(async (id: string) => {
    if (!userId) throw new Error(HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED);
    const { data, error } = await supabase.from('habits').delete().eq('id', id).eq('user_id', userId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Habit was not deleted. Please try again.');
    writeHabits(readHabits().filter(h => h.id !== id));
  }, [readHabits, writeHabits, userId]);

  const resetAll = useCallback(async () => {
    if (!userId) throw new Error(HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED);

    // Delete only rows owned by the authenticated user, and request the deleted
    // IDs so a zero-row/RLS no-op cannot be mistaken for a successful reset.
    const { error: deleteError } = await supabase
      .from('habits')
      .delete()
      .eq('user_id', userId)
      .select('id');
    if (deleteError) throw deleteError;

    // Verify server state before clearing the local cache. This also catches
    // policies that silently leave rows untouched.
    const { data: remaining, error: verifyError } = await supabase
      .from('habits')
      .select('id')
      .eq('user_id', userId)
      .limit(1);
    if (verifyError) throw verifyError;
    if (remaining?.length) {
      throw new Error('Habits remain after reset. Check your connection and permissions, then retry.');
    }

    writeHabits([]);
    await queryClient.invalidateQueries({ queryKey });
  }, [userId, writeHabits, queryClient, queryKey]);

  return {
    habits,
    allHabits,
    lockedHabits,
    lockedHabitIds,
    isHabitLocked,
    premiumProgressLocked,
    loading,
    addHabit,
    updateHabit,
    toggleCompletion,
    deleteHabit,
    resetAll,
    refetch,
  };
}

