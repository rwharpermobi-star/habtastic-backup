-- Restore habit columns required by the current Android/web clients.
-- Production drifted from source and was missing both columns, causing every
-- insert that included reminder_tone/sound_mode to fail.
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS reminder_tone text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sound_mode text NOT NULL DEFAULT 'normal';

-- Keep the database category constraint aligned with the habit creation UI.
ALTER TABLE public.habits
  DROP CONSTRAINT IF EXISTS habits_category_check;

ALTER TABLE public.habits
  ADD CONSTRAINT habits_category_check
  CHECK (category = ANY (ARRAY[
    'health'::text,
    'mindset'::text,
    'work'::text,
    'art'::text,
    'finance'::text,
    'custom'::text
  ]));
