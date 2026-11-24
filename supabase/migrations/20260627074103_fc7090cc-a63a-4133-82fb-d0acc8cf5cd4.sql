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
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount = 0 THEN RETURN 0; END IF;

  _is_service_role := (
    current_setting('role', true) = 'service_role'
    OR current_user = 'supabase_admin'
    OR current_user = 'postgres'
    OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
  );

  -- Block unauthenticated callers entirely; service role bypass remains.
  IF auth.uid() IS NULL AND NOT _is_service_role THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _cap := CASE _reason
    WHEN 'habit_complete'       THEN 200
    WHEN 'habit_undo'           THEN 200
    WHEN 'challenge_day'        THEN 100
    WHEN 'challenge_complete'   THEN 500
    WHEN 'winston_challenge'    THEN 500
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
    RAISE EXCEPTION 'Negative XP not allowed for reason %', _reason;
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

  SELECT COALESCE(xp, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  _new_balance := GREATEST(0, _current + _amount);

  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('xp', _new_balance));

  BEGIN
    INSERT INTO public.xp_transactions(user_id, delta, reason, metadata, balance_after)
    VALUES (_user_id, _amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);
  EXCEPTION WHEN unique_violation THEN
    PERFORM public.update_profile_internal(_user_id, jsonb_build_object('xp', _current));
    RETURN 0;
  END;

  RETURN _amount;
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_gems(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
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
  _is_service_role boolean;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN 0; END IF;

  _is_service_role := (
    current_setting('role', true) = 'service_role'
    OR current_user = 'supabase_admin'
    OR current_user = 'postgres'
    OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
  );

  IF auth.uid() IS NULL AND NOT _is_service_role THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _cap := CASE _reason
    WHEN 'weekly_consistency' THEN 5
    WHEN 'challenge_complete' THEN 20
    WHEN 'level_up'           THEN 10
    WHEN 'surprise_reward'    THEN 10
    WHEN 'purchase'           THEN NULL
    ELSE NULL
  END;

  IF _cap IS NOT NULL THEN
    SELECT COALESCE(SUM(delta),0) INTO _today_total
    FROM public.gem_transactions
    WHERE user_id=_user_id AND reason=_reason
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;
    IF _today_total >= _cap THEN RETURN 0; END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;

  SELECT COALESCE(gems,0) INTO _current FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
  _new_balance := _current + _amount;

  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('gems', _new_balance));

  INSERT INTO public.gem_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, COALESCE(_metadata,'{}'::jsonb), _new_balance);

  RETURN _amount;
END;
$function$;