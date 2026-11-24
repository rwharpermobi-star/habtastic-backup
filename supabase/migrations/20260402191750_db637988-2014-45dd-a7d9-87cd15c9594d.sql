
-- Create goals table for user goal tracking
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER DEFAULT 1,
  current_value INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'times',
  frequency TEXT DEFAULT 'weekly',
  status TEXT DEFAULT 'active',
  deadline DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own goals" ON public.goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create weekly_summaries table to cache generated summaries
CREATE TABLE public.weekly_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  summary TEXT NOT NULL,
  habits_completed INTEGER DEFAULT 0,
  total_habits INTEGER DEFAULT 0,
  mood_trend TEXT,
  top_streak INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own summaries" ON public.weekly_summaries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summaries" ON public.weekly_summaries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Unique constraint to prevent duplicate weekly summaries
ALTER TABLE public.weekly_summaries ADD CONSTRAINT unique_user_week UNIQUE (user_id, week_start);
