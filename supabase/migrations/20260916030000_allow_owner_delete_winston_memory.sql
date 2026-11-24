-- Allow a signed-in user to remove their own stale Winston memory tags.
-- This matches the existing deleteGoal cleanup path while keeping cross-account
-- access impossible through RLS.
GRANT DELETE ON TABLE public.winston_memory TO authenticated;

DROP POLICY IF EXISTS "Users can delete own winston memory" ON public.winston_memory;
CREATE POLICY "Users can delete own winston memory"
ON public.winston_memory
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);
