CREATE OR REPLACE FUNCTION public.consume_ai_message()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used int; _reset date; _limit int := 20; _premium boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  _premium := public.user_is_premium(_uid);
  IF _premium THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'used', 0, 'limit', NULL);
  END IF;

  SELECT COALESCE(daily_ai_messages,0), last_ai_reset INTO _used, _reset
    FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF _used IS NULL THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF _reset IS DISTINCT FROM _today THEN _used := 0; END IF;

  IF _used >= _limit THEN
    UPDATE public.profiles SET daily_ai_messages = _used, last_ai_reset = _today, updated_at = now()
      WHERE user_id = _uid;
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'used', _used, 'limit', _limit);
  END IF;

  UPDATE public.profiles SET daily_ai_messages = _used + 1, last_ai_reset = _today, updated_at = now()
    WHERE user_id = _uid;
  RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'used', _used + 1, 'limit', _limit);
END; $$;
REVOKE ALL ON FUNCTION public.consume_ai_message() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_message() TO authenticated, service_role;