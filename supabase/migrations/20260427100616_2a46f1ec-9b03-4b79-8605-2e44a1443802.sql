-- Per-habit reminder controls
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_tone text NOT NULL DEFAULT 'normal';

-- Profile: last activity timestamp for comeback engine
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz NOT NULL DEFAULT now();

-- Per-user notification preferences
CREATE TABLE IF NOT EXISTS public.notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  timezone text NOT NULL DEFAULT 'UTC',
  default_tone text NOT NULL DEFAULT 'normal', -- normal | motivational | strong
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start text NOT NULL DEFAULT '22:00',
  quiet_hours_end text NOT NULL DEFAULT '06:00',
  per_habit_enabled boolean NOT NULL DEFAULT true,
  missed_followups_enabled boolean NOT NULL DEFAULT true,
  comeback_enabled boolean NOT NULL DEFAULT true,
  streak_pressure_enabled boolean NOT NULL DEFAULT true,
  weekly_recap_enabled boolean NOT NULL DEFAULT true,
  weekly_recap_dow int NOT NULL DEFAULT 0, -- 0=Sun
  weekly_recap_time text NOT NULL DEFAULT '18:00',
  reward_toasts_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notif prefs" ON public.notification_prefs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own notif prefs" ON public.notification_prefs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own notif prefs" ON public.notification_prefs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notification dispatch log (dedup + analytics)
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL, -- per_habit | missed_1h | missed_eod | comeback_1d | comeback_3d | comeback_5d | streak_pressure | streak_lost | weekly_recap | reward
  habit_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  dedup_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_log_dedup_idx
  ON public.notification_log (user_id, dedup_key);
CREATE INDEX IF NOT EXISTS notification_log_user_sent_idx
  ON public.notification_log (user_id, sent_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notif log" ON public.notification_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Web-push subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own push subs" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own push subs" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own push subs" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger for notification_prefs
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS notification_prefs_touch ON public.notification_prefs;
CREATE TRIGGER notification_prefs_touch
  BEFORE UPDATE ON public.notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable required extensions for cron + http (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;