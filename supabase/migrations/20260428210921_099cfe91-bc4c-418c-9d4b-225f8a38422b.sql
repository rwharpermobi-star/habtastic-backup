
CREATE TABLE public.ai_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  summary text NOT NULL,
  weak_points text NOT NULL,
  suggestion text NOT NULL,
  completion_rate numeric NOT NULL DEFAULT 0,
  prev_completion_rate numeric,
  best_day text,
  worst_day text,
  morning_count integer NOT NULL DEFAULT 0,
  evening_count integer NOT NULL DEFAULT 0,
  habits_total integer NOT NULL DEFAULT 0,
  habits_completed integer NOT NULL DEFAULT 0,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_ai_weekly_reviews_user_week ON public.ai_weekly_reviews(user_id, week_start DESC);

ALTER TABLE public.ai_weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai weekly reviews"
ON public.ai_weekly_reviews FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai weekly reviews"
ON public.ai_weekly_reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ai weekly reviews"
ON public.ai_weekly_reviews FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ai weekly reviews"
ON public.ai_weekly_reviews FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
