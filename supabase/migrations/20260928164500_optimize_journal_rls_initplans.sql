-- Cache auth/journal lock checks once per statement instead of once per row.

ALTER POLICY "Users can insert unlocked journal entries" ON public.journal_entries
  WITH CHECK (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can update unlocked journal entries" ON public.journal_entries
  USING (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)))
  WITH CHECK (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can delete unlocked journal entries" ON public.journal_entries
  USING (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can insert unlocked journal folders" ON public.journal_folders
  WITH CHECK (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can update unlocked journal folders" ON public.journal_folders
  USING (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)))
  WITH CHECK (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can delete unlocked journal folders" ON public.journal_folders
  USING (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can insert unlocked journal memories" ON public.journal_memories
  WITH CHECK (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can update unlocked journal memories" ON public.journal_memories
  USING (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)))
  WITH CHECK (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));

ALTER POLICY "Users can delete unlocked journal memories" ON public.journal_memories
  USING (((SELECT auth.uid()) = user_id) AND (SELECT public.journal_is_unlocked(user_id)));
