
-- =========================================================
-- BATCH 2: FOUNDATION
-- =========================================================

-- ---------- app_role enum + user_roles ----------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- has_role: SECURITY DEFINER to avoid recursive RLS on user_roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ---------- rate_limits_ip ----------
CREATE TABLE IF NOT EXISTS public.rate_limits_ip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  endpoint text NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_ip_lookup_idx
  ON public.rate_limits_ip (ip_address, endpoint, window_start DESC);

GRANT ALL ON public.rate_limits_ip TO service_role;
ALTER TABLE public.rate_limits_ip ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (edge functions) touches this table.

-- rate_limit_check_ip: returns true if allowed, false if over limit.
CREATE OR REPLACE FUNCTION public.rate_limit_check_ip(
  _ip text,
  _endpoint text,
  _max_requests int,
  _window_seconds int
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _window_start timestamptz := now() - make_interval(secs => _window_seconds);
  _count int;
BEGIN
  -- Clean old rows opportunistically
  DELETE FROM public.rate_limits_ip
    WHERE window_start < now() - interval '1 hour';

  SELECT COALESCE(SUM(request_count),0) INTO _count
    FROM public.rate_limits_ip
    WHERE ip_address = _ip
      AND endpoint = _endpoint
      AND window_start >= _window_start;

  IF _count >= _max_requests THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limits_ip (ip_address, endpoint, request_count, window_start)
    VALUES (_ip, _endpoint, 1, now());

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_check_ip(text,text,int,int) FROM public;
GRANT EXECUTE ON FUNCTION public.rate_limit_check_ip(text,text,int,int) TO service_role;

-- ---------- notifications ----------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime for in-app bell
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;

-- ---------- profiles: missing columns ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_avatar_credits_used int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_avatar_credits_reset_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

-- Extend protect_profile_fields to lock the new sensitive columns
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF current_setting('role') = 'service_role'
     OR current_user = 'supabase_admin'
     OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  NEW.daily_ai_messages := OLD.daily_ai_messages;
  NEW.last_ai_reset := OLD.last_ai_reset;
  NEW.streak_freezes := OLD.streak_freezes;
  NEW.freeze_used_dates := OLD.freeze_used_dates;
  NEW.xp := OLD.xp;
  NEW.coins := OLD.coins;
  NEW.gems := OLD.gems;
  NEW.unlocked_themes := OLD.unlocked_themes;
  NEW.unlocked_effects := OLD.unlocked_effects;
  NEW.ai_avatar_credits_used := OLD.ai_avatar_credits_used;
  NEW.ai_avatar_credits_reset_at := OLD.ai_avatar_credits_reset_at;
  NEW.trial_started_at := OLD.trial_started_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_fields_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- Ensure handle_new_user trigger exists (creates profile row on auth.users insert)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
