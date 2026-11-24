ALTER TABLE public.profiles 
  ADD COLUMN streak_freezes integer NOT NULL DEFAULT 0,
  ADD COLUMN freeze_used_dates text[] NOT NULL DEFAULT '{}'::text[];