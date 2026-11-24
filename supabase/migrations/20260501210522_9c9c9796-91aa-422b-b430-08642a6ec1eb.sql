
-- ============================================================
-- PART A: Audit log + security alerts
-- ============================================================

CREATE TABLE public.profile_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  auth_uid uuid,
  caller_role text,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  attempted_fields text[] NOT NULL DEFAULT '{}',
  delta jsonb,
  ip text,
  user_agent text,
  request_id text
);

CREATE INDEX idx_profile_audit_user ON public.profile_audit_log(user_id, created_at DESC);
CREATE INDEX idx_profile_audit_severity ON public.profile_audit_log(severity, created_at DESC) WHERE severity = 'alert';

ALTER TABLE public.profile_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  count int NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type)
);

CREATE INDEX idx_security_alerts_last_seen ON public.security_alerts(last_seen DESC);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rollup_security_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.severity = 'alert' THEN
    INSERT INTO public.security_alerts (user_id, event_type, count, first_seen, last_seen)
    VALUES (NEW.user_id, NEW.event_type, 1, NEW.created_at, NEW.created_at)
    ON CONFLICT (user_id, event_type) DO UPDATE
      SET count = public.security_alerts.count + 1,
          last_seen = NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollup_security_alert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollup_security_alert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rollup_security_alert() FROM authenticated;

CREATE TRIGGER trg_rollup_security_alert
AFTER INSERT ON public.profile_audit_log
FOR EACH ROW EXECUTE FUNCTION public.rollup_security_alert();

-- ============================================================
-- Enhance update_profile_internal with detection + logging
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_service_role boolean;
  _caller_role text;
  _headers jsonb;
  _ip text;
  _ua text;
  _req_id text;
  _attempted text[];
  _had_premium_attempt boolean := false;
  _old record;
  _delta_coins int := 0;
  _delta_gems int := 0;
  _delta_xp int := 0;
  _new_coins int;
  _new_gems int;
  _new_xp int;
  _delta jsonb := '{}'::jsonb;
BEGIN
  _is_service_role := (
    current_setting('role', true) = 'service_role'
    OR current_user = 'supabase_admin'
    OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
  );

  _caller_role := CASE WHEN _is_service_role THEN 'service_role'
                       WHEN auth.uid() IS NOT NULL THEN 'authenticated'
                       ELSE 'anon' END;

  BEGIN
    _headers := current_setting('request.headers', true)::jsonb;
    _ip := COALESCE(_headers->>'x-forwarded-for', _headers->>'cf-connecting-ip');
    _ua := _headers->>'user-agent';
    _req_id := _headers->>'x-request-id';
  EXCEPTION WHEN others THEN
    _headers := NULL;
  END;

  _attempted := ARRAY(SELECT jsonb_object_keys(_updates));

  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.profile_audit_log
      (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, ip, user_agent, request_id)
    VALUES
      (_user_id, auth.uid(), _caller_role, 'cross_user_attempt', 'alert', _attempted, _ip, _ua, _req_id);
    RAISE EXCEPTION 'Unauthorized: cannot update another user''s profile';
  END IF;

  IF NOT _is_service_role AND (_updates ? 'is_premium' OR _updates ? 'premium_until') THEN
    _had_premium_attempt := true;
    _updates := _updates - 'is_premium' - 'premium_until';
  END IF;

  SELECT coins, gems, xp INTO _old FROM public.profiles WHERE user_id = _user_id;

  IF _updates ? 'coins' THEN
    _new_coins := (_updates->>'coins')::int;
    _delta_coins := COALESCE(_new_coins, 0) - COALESCE(_old.coins, 0);
    _delta := _delta || jsonb_build_object('coins', jsonb_build_object('old', _old.coins, 'new', _new_coins, 'delta', _delta_coins));
  END IF;
  IF _updates ? 'gems' THEN
    _new_gems := (_updates->>'gems')::int;
    _delta_gems := COALESCE(_new_gems, 0) - COALESCE(_old.gems, 0);
    _delta := _delta || jsonb_build_object('gems', jsonb_build_object('old', _old.gems, 'new', _new_gems, 'delta', _delta_gems));
  END IF;
  IF _updates ? 'xp' THEN
    _new_xp := (_updates->>'xp')::int;
    _delta_xp := COALESCE(_new_xp, 0) - COALESCE(_old.xp, 0);
    _delta := _delta || jsonb_build_object('xp', jsonb_build_object('old', _old.xp, 'new', _new_xp, 'delta', _delta_xp));
  END IF;

  UPDATE public.profiles
  SET
    is_premium = COALESCE((_updates->>'is_premium')::boolean, is_premium),
    premium_until = COALESCE((_updates->>'premium_until')::timestamptz, premium_until),
    daily_ai_messages = COALESCE((_updates->>'daily_ai_messages')::int, daily_ai_messages),
    last_ai_reset = COALESCE((_updates->>'last_ai_reset')::date, last_ai_reset),
    streak_freezes = COALESCE((_updates->>'streak_freezes')::int, streak_freezes),
    freeze_used_dates = CASE
      WHEN _updates ? 'freeze_used_dates' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'freeze_used_dates'))
      ELSE freeze_used_dates
    END,
    xp = COALESCE((_updates->>'xp')::int, xp),
    coins = COALESCE((_updates->>'coins')::int, coins),
    gems = COALESCE((_updates->>'gems')::int, gems),
    unlocked_themes = CASE
      WHEN _updates ? 'unlocked_themes' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'unlocked_themes'))
      ELSE unlocked_themes
    END,
    unlocked_effects = CASE
      WHEN _updates ? 'unlocked_effects' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'unlocked_effects'))
      ELSE unlocked_effects
    END,
    ai_avatar_credits_used = COALESCE((_updates->>'ai_avatar_credits_used')::int, ai_avatar_credits_used),
    ai_avatar_credits_reset_at = COALESCE((_updates->>'ai_avatar_credits_reset_at')::timestamptz, ai_avatar_credits_reset_at),
    updated_at = now()
  WHERE user_id = _user_id;

  IF _had_premium_attempt THEN
    INSERT INTO public.profile_audit_log
      (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
    VALUES
      (_user_id, auth.uid(), _caller_role, 'premium_attempt', 'alert', _attempted, _delta, _ip, _ua, _req_id);
  END IF;

  IF NOT _is_service_role THEN
    IF _delta_coins > 500 OR _delta_gems > 500 THEN
      INSERT INTO public.profile_audit_log
        (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
      VALUES
        (_user_id, auth.uid(), _caller_role, 'currency_delta', 'alert', _attempted, _delta, _ip, _ua, _req_id);
    ELSIF _delta_coins < 0 OR _delta_gems < 0 THEN
      INSERT INTO public.profile_audit_log
        (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
      VALUES
        (_user_id, auth.uid(), _caller_role, 'currency_delta', 'warn', _attempted, _delta, _ip, _ua, _req_id);
    END IF;

    IF _delta_xp > 1000 THEN
      INSERT INTO public.profile_audit_log
        (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
      VALUES
        (_user_id, auth.uid(), _caller_role, 'large_xp_delta', 'alert', _attempted, _delta, _ip, _ua, _req_id);
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- PART B: Linter fixes
-- ============================================================

-- Fix 1: Reinstall pg_net into dedicated schema (SET SCHEMA not supported)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Fix 2: Restrict avatars bucket listing to owner
DROP POLICY IF EXISTS "Authenticated users can view avatars" ON storage.objects;
CREATE POLICY "Users can list own avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Fix 3: prune_my_chat_messages -> SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.prune_my_chat_messages(_keep_last integer DEFAULT 200, _max_age_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  deleted_count integer := 0;
  age_deleted integer := 0;
  cap_deleted integer := 0;
  keep_last integer := greatest(coalesce(_keep_last, 200), 20);
  max_age integer := greatest(coalesce(_max_age_days, 60), 7);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH del AS (
    DELETE FROM public.chat_messages
    WHERE user_id = uid
      AND created_at < now() - (max_age || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO age_deleted FROM del;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY coach_id
             ORDER BY created_at DESC
           ) AS rn
    FROM public.chat_messages
    WHERE user_id = uid
  ),
  del AS (
    DELETE FROM public.chat_messages
    WHERE id IN (SELECT id FROM ranked WHERE rn > keep_last)
    RETURNING 1
  )
  SELECT count(*) INTO cap_deleted FROM del;

  deleted_count := age_deleted + cap_deleted;
  RETURN deleted_count;
END;
$$;
