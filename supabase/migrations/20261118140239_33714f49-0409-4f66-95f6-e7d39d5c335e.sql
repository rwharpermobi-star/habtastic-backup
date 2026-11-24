DROP FUNCTION IF EXISTS public.start_winston_ad_reward();

CREATE OR REPLACE FUNCTION public.start_winston_ad_reward_for(_uid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
REVOKE ALL ON FUNCTION public.start_winston_ad_reward_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_winston_ad_reward_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_winston_ad_reward_status(_nonce uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
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
    SELECT CASE WHEN status = 'pending' AND expires_at < now() THEN 'expired' ELSE status END
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