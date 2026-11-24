
CREATE TABLE public.mood_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id uuid,
  mood text NOT NULL,
  intensity integer NOT NULL DEFAULT 3,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mood_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own mood logs" ON public.mood_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own mood logs" ON public.mood_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own mood logs" ON public.mood_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_mood_logs_user_date ON public.mood_logs(user_id, date DESC);
