CREATE TABLE public.winston_ad_reward_sessions (
  nonce uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'granted', 'rejected')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  transaction_id text UNIQUE,
  ad_unit text,
  reward_messages integer NOT NULL DEFAULT 0 CHECK (reward_messages >= 0),
  reward_day date,
  reject_reason text,
  granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.winston_ad_reward_sessions TO authenticated;
GRANT ALL ON public.winston_ad_reward_sessions TO service_role;

ALTER TABLE public.winston_ad_reward_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Winston ad rewards"
  ON public.winston_ad_reward_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX winston_ad_reward_sessions_user_day_idx
  ON public.winston_ad_reward_sessions (user_id, reward_day) WHERE status = 'granted';
CREATE INDEX winston_ad_reward_sessions_user_created_idx
  ON public.winston_ad_reward_sessions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.winston_ad_reward_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER winston_ad_reward_sessions_updated_at
  BEFORE UPDATE ON public.winston_ad_reward_sessions
  FOR EACH ROW EXECUTE FUNCTION public.winston_ad_reward_touch_updated_at();

-- Reward rules (single source of truth on the server).
CREATE OR REPLACE FUNCTION public.winston_ad_reward_rules()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_build_object('per_view', 3, 'daily_views', 3, 'free_limit', 5, 'pending_cap', 5);
$$;

CREATE OR REPLACE FUNCTION public.winston_ad_bonus_today(_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(reward_messages), 0)::integer
    FROM public.winston_ad_reward_sessions
   WHERE user_id = _uid
     AND status = 'granted'
     AND reward_day = (now() AT TIME ZONE 'utc')::date;
$$;
REVOKE ALL ON FUNCTION public.winston_ad_bonus_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.winston_ad_bonus_today(uuid) TO service_role;

-- Status for the signed-in user (optionally for one of their own sessions).
CREATE OR REPLACE FUNCTION public.get_winston_ad_reward_status(_nonce uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _rules jsonb := public.winston_ad_reward_rules();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _views int;
  _bonus int;
  _session_status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  SELECT count(*)::int, COALESCE(SUM(reward_messages), 0)::int INTO _views, _bonus
    FROM public.winston_ad_reward_sessions
   WHERE user_id = _uid AND status = 'granted' AND reward_day = _today;

  IF _nonce IS NOT NULL THEN
    SELECT CASE
             WHEN status = 'pending' AND expires_at < now() THEN 'expired'
             ELSE status
           END
      INTO _session_status
      FROM public.winston_ad_reward_sessions
     WHERE nonce = _nonce AND user_id = _uid;
  END IF;

  RETURN jsonb_build_object(
    'session_status', _session_status,
    'premium', public.user_is_premium(_uid),
    'views_today', _views,
    'views_left', GREATEST(0, (_rules->>'daily_views')::int - _views),
    'bonus_today', _bonus,
    'per_view', (_rules->>'per_view')::int,
    'daily_views', (_rules->>'daily_views')::int,
    'free_limit', (_rules->>'free_limit')::int
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_winston_ad_reward_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_winston_ad_reward_status(uuid) TO authenticated, service_role;

-- Opt-in: the signed-in Free user asks for a one-time code before watching.
CREATE OR REPLACE FUNCTION public.start_winston_ad_reward()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _rules jsonb := public.winston_ad_reward_rules();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _views int;
  _pending int;
  _nonce uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  IF public.user_is_premium(_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('winston-ad-reward:' || _uid::text));

  SELECT count(*)::int INTO _views
    FROM public.winston_ad_reward_sessions
   WHERE user_id = _uid AND status = 'granted' AND reward_day = _today;
  IF _views >= (_rules->>'daily_views')::int THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap');
  END IF;

  SELECT count(*)::int INTO _pending
    FROM public.winston_ad_reward_sessions
   WHERE user_id = _uid AND status = 'pending' AND expires_at > now();
  IF _pending >= (_rules->>'pending_cap')::int THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_pending');
  END IF;

  INSERT INTO public.winston_ad_reward_sessions (user_id) VALUES (_uid) RETURNING nonce INTO _nonce;
  RETURN jsonb_build_object('ok', true, 'nonce', _nonce);
END;
$$;
REVOKE ALL ON FUNCTION public.start_winston_ad_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_winston_ad_reward() TO authenticated, service_role;

-- Server-only: called by the AdMob SSV endpoint AFTER Google's signature is verified.
CREATE OR REPLACE FUNCTION public.grant_winston_ad_reward(
  _nonce uuid, _user_id uuid, _transaction_id text, _ad_unit text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rules jsonb := public.winston_ad_reward_rules();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _s public.winston_ad_reward_sessions%ROWTYPE;
  _views int;
BEGIN
  IF _nonce IS NULL OR _user_id IS NULL OR COALESCE(btrim(_transaction_id), '') = '' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('winston-ad-reward:' || _user_id::text));

  SELECT * INTO _s FROM public.winston_ad_reward_sessions WHERE nonce = _nonce FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'unknown_session');
  END IF;
  IF _s.user_id <> _user_id THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'user_mismatch');
  END IF;
  IF _s.status = 'granted' THEN
    RETURN jsonb_build_object('granted', true, 'reason', 'already_granted', 'duplicate', true);
  END IF;
  IF _s.status = 'rejected' THEN
    RETURN jsonb_build_object('granted', false, 'reason', COALESCE(_s.reject_reason, 'rejected'));
  END IF;

  IF EXISTS (SELECT 1 FROM public.winston_ad_reward_sessions WHERE transaction_id = _transaction_id) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'duplicate_transaction');
  END IF;

  IF _s.expires_at < now() THEN
    UPDATE public.winston_ad_reward_sessions
       SET status = 'rejected', reject_reason = 'expired', transaction_id = _transaction_id, ad_unit = _ad_unit
     WHERE nonce = _nonce;
    RETURN jsonb_build_object('granted', false, 'reason', 'expired');
  END IF;

  IF public.user_is_premium(_user_id) THEN
    UPDATE public.winston_ad_reward_sessions
       SET status = 'rejected', reject_reason = 'premium', transaction_id = _transaction_id, ad_unit = _ad_unit
     WHERE nonce = _nonce;
    RETURN jsonb_build_object('granted', false, 'reason', 'premium');
  END IF;

  SELECT count(*)::int INTO _views
    FROM public.winston_ad_reward_sessions
   WHERE user_id = _user_id AND status = 'granted' AND reward_day = _today;
  IF _views >= (_rules->>'daily_views')::int THEN
    UPDATE public.winston_ad_reward_sessions
       SET status = 'rejected', reject_reason = 'daily_cap', transaction_id = _transaction_id, ad_unit = _ad_unit
     WHERE nonce = _nonce;
    RETURN jsonb_build_object('granted', false, 'reason', 'daily_cap');
  END IF;

  UPDATE public.winston_ad_reward_sessions
     SET status = 'granted',
         transaction_id = _transaction_id,
         ad_unit = _ad_unit,
         reward_messages = (_rules->>'per_view')::int,
         reward_day = _today,
         granted_at = now()
   WHERE nonce = _nonce;

  RETURN jsonb_build_object('granted', true, 'messages', (_rules->>'per_view')::int);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_winston_ad_reward(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_winston_ad_reward(uuid, uuid, text, text) TO service_role;

-- Winston's Free daily limit now includes today's verified ad bonus.
CREATE OR REPLACE FUNCTION public.consume_ai_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used int;
  _reset date;
  _base int := (public.winston_ad_reward_rules()->>'free_limit')::int;
  _bonus int;
  _limit int;
  _premium boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  _premium := public.user_is_premium(_uid);
  IF _premium THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'used', 0, 'limit', NULL);
  END IF;
  SELECT COALESCE(daily_ai_messages, 0), last_ai_reset INTO _used, _reset
    FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF _used IS NULL THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF _reset IS DISTINCT FROM _today THEN _used := 0; END IF;
  _bonus := public.winston_ad_bonus_today(_uid);
  _limit := _base + _bonus;
  IF _used >= _limit THEN
    UPDATE public.profiles SET daily_ai_messages = _used, last_ai_reset = _today, updated_at = now() WHERE user_id = _uid;
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'used', _used, 'limit', _limit, 'bonus', _bonus);
  END IF;
  UPDATE public.profiles SET daily_ai_messages = _used + 1, last_ai_reset = _today, updated_at = now() WHERE user_id = _uid;
  RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'used', _used + 1, 'limit', _limit, 'bonus', _bonus);
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_ai_message() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_message() TO authenticated, service_role;