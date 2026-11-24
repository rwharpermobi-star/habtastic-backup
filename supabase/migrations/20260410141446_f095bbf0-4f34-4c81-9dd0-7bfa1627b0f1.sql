
CREATE TABLE public.weekly_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  growth_score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'D',
  habits_completed INTEGER NOT NULL DEFAULT 0,
  total_habits INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  perfect_days INTEGER NOT NULL DEFAULT 0,
  display_name TEXT NOT NULL DEFAULT 'Hero',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

ALTER TABLE public.weekly_scores ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can see the leaderboard
CREATE POLICY "Anyone can view leaderboard scores"
  ON public.weekly_scores FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert/update their own scores
CREATE POLICY "Users can insert own scores"
  ON public.weekly_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scores"
  ON public.weekly_scores FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
