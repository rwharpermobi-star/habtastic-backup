-- Preserve existing content and dates while matching the diary sync contract.
ALTER TABLE public.diary_entries
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entry_at timestamptz;

UPDATE public.diary_entries SET entry_at = created_at WHERE entry_at IS NULL;
ALTER TABLE public.diary_entries
  ALTER COLUMN entry_at SET DEFAULT now(),
  ALTER COLUMN entry_at SET NOT NULL;

-- Keep the existing owner policy; additionally require the same PIN session as Journal.
-- A restrictive policy cannot be bypassed by an existing permissive owner policy.
CREATE POLICY diary_pin_required ON public.diary_entries
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.journal_is_unlocked(user_id)))
  WITH CHECK ((SELECT public.journal_is_unlocked(user_id)));

NOTIFY pgrst, 'reload schema';
