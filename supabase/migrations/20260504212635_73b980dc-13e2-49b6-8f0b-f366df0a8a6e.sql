CREATE TABLE public.diary_entries (
  id uuid NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  entry_at timestamptz NOT NULL DEFAULT now(),
  mood text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own diary"
  ON public.diary_entries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own diary"
  ON public.diary_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own diary"
  ON public.diary_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own diary"
  ON public.diary_entries FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX diary_entries_user_entry_at_idx
  ON public.diary_entries (user_id, entry_at DESC);

CREATE TRIGGER diary_entries_touch_updated_at
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();