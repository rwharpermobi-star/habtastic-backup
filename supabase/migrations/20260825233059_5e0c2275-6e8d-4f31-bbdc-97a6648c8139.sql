-- Keep XP audit/test helpers internal-only; they are not app features.
REVOKE ALL ON FUNCTION public.xp_award_duplicate_exists(uuid,text,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_award_duplicate_exists(uuid,text,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.xp_sync_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_sync_snapshot(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.xp_award_regression_check(integer,text,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_award_regression_check(integer,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.xp_award_duplicate_exists(
  _user_id uuid,
  _reason text,
  _metadata jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _date text := COALESCE(_metadata->>'date', (_metadata->>'completed_date'));
  _habit_id text := _metadata->>'habit_id';
  _challenge_id text := _metadata->>'challenge_id';
  _template text := _metadata->>'template';
  _entry_id text := COALESCE(_metadata->>'entry_id', _metadata->>'journal_entry_id');
  _kind text := _metadata->>'kind';
  _key text := _metadata->>'key';
BEGIN
  IF _user_id IS NULL OR _reason IS NULL THEN
    RETURN false;
  END IF;

  IF _reason IN ('habit_complete', 'habit_undo', 'habit_verification') AND _habit_id IS NOT NULL AND _date IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND metadata->>'habit_id' = _habit_id
        AND COALESCE(metadata->>'date', metadata->>'completed_date') = _date
    );
  END IF;

  IF _reason IN ('challenge_complete', 'winston_challenge', 'winston_challenge_complete', 'ai_challenge_complete', 'ai_challenge')
     AND _challenge_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND metadata->>'challenge_id' = _challenge_id
    );
  END IF;

  IF _reason = 'challenge_day' AND _date IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND COALESCE(metadata->>'date', metadata->>'completed_date') = _date
        AND COALESCE(metadata->>'template', '') = COALESCE(_template, '')
    );
  END IF;

  IF _reason IN ('journal_write', 'journal_voice', 'journal_ai_feedback', 'daily_reflection', 'streak_7', 'streak_30')
     AND _date IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND COALESCE(metadata->>'date', metadata->>'completed_date') = _date
    );
  END IF;

  IF _reason IN ('journal_write', 'journal_voice', 'journal_ai_feedback') AND _entry_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND COALESCE(metadata->>'entry_id', metadata->>'journal_entry_id') = _entry_id
    );
  END IF;

  IF _reason = 'celebration' AND _kind IS NOT NULL AND _key IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND metadata->>'kind' = _kind
        AND metadata->>'key' = _key
    );
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.xp_award_duplicate_exists(uuid,text,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xp_award_duplicate_exists(uuid,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.award_xp(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current int;
  _today_total int;
  _cap int;
  _new_balance int;
  _allow_negative boolean := false;
  _is_service_role boolean;
  _claims_role text;
  _safe_metadata jsonb := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount = 0 THEN RETURN 0; END IF;

  _claims_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  _is_service_role := (
    session_user IN ('service_role','supabase_admin','postgres')
    OR _claims_role = 'service_role'
  );

  IF auth.uid() IS NULL AND NOT _is_service_role THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  _cap := CASE _reason
    WHEN 'habit_complete'       THEN 200
    WHEN 'habit_undo'           THEN 200
    WHEN 'habit_verification'   THEN 75
    WHEN 'challenge_day'        THEN 100
    WHEN 'challenge_complete'   THEN 500
    WHEN 'winston_challenge'    THEN 500
    WHEN 'winston_challenge_complete' THEN 500
    WHEN 'ai_challenge_complete' THEN 500
    WHEN 'ai_challenge'         THEN 500
    WHEN 'journal_write'        THEN 60
    WHEN 'journal_voice'        THEN 80
    WHEN 'journal_ai_feedback'  THEN 40
    WHEN 'streak_7'             THEN 50
    WHEN 'streak_30'            THEN 100
    WHEN 'referral'             THEN 1000
    WHEN 'surprise_reward'      THEN 200
    WHEN 'daily_reflection'     THEN 30
    ELSE NULL
  END;

  _allow_negative := _reason IN ('habit_undo');

  IF _amount < 0 AND NOT _allow_negative THEN
    RAISE EXCEPTION 'negative_xp_not_allowed';
  END IF;

  -- Check replay before touching profiles.xp so dedupe never needs to roll back
  -- the single source-of-truth balance. Applies to positive awards and negative
  -- undo awards alike.
  IF public.xp_award_duplicate_exists(_user_id, _reason, _safe_metadata) THEN
    RETURN 0;
  END IF;

  IF _cap IS NOT NULL AND _amount > 0 THEN
    SELECT COALESCE(SUM(delta), 0) INTO _today_total
    FROM public.xp_transactions
    WHERE user_id = _user_id
      AND reason = _reason
      AND delta > 0
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;
    IF _today_total >= _cap THEN RETURN 0; END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;

  SELECT COALESCE(xp, 0) INTO _current
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF _current IS NULL THEN RETURN 0; END IF;

  _new_balance := GREATEST(0, _current + _amount);

  INSERT INTO public.xp_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _safe_metadata, _new_balance);

  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('xp', _new_balance));

  RETURN _amount;
END;
$function$;

REVOKE ALL ON FUNCTION public.award_xp(uuid,integer,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid,integer,text,jsonb) TO authenticated, service_role;