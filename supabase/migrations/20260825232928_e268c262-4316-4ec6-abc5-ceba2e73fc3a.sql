-- XP synchronization hardening for Level + Star progression.
-- profiles.xp remains the single source of truth; xp_transactions is the ledger.

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

  -- Per-habit daily completion is idempotent by habit + date.
  IF _reason IN ('habit_complete', 'habit_undo') AND _habit_id IS NOT NULL AND _date IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND metadata->>'habit_id' = _habit_id
        AND COALESCE(metadata->>'date', metadata->>'completed_date') = _date
    );
  END IF;

  -- Server-backed challenge completion is idempotent by challenge id.
  IF _reason IN ('challenge_complete', 'winston_challenge', 'winston_challenge_complete', 'ai_challenge_complete', 'ai_challenge')
     AND _challenge_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND metadata->>'challenge_id' = _challenge_id
    );
  END IF;

  -- Local daily Winston challenge is idempotent per day/template.
  IF _reason = 'challenge_day' AND _date IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND COALESCE(metadata->>'date', metadata->>'completed_date') = _date
        AND COALESCE(metadata->>'template', '') = COALESCE(_template, '')
    );
  END IF;

  -- Once-per-day reward reasons should not replay when a component re-renders.
  IF _reason IN ('journal_write', 'journal_voice', 'journal_ai_feedback', 'daily_reflection', 'streak_7', 'streak_30')
     AND _date IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND COALESCE(metadata->>'date', metadata->>'completed_date') = _date
    );
  END IF;

  -- If the caller supplies a journal entry id, use it as the stronger key.
  IF _reason IN ('journal_write', 'journal_voice', 'journal_ai_feedback') AND _entry_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.xp_transactions
      WHERE user_id = _user_id
        AND reason = _reason
        AND COALESCE(metadata->>'entry_id', metadata->>'journal_entry_id') = _entry_id
    );
  END IF;

  -- Celebration awards are idempotent by their natural key.
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

REVOKE ALL ON FUNCTION public.xp_award_duplicate_exists(uuid,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.xp_award_duplicate_exists(uuid,text,jsonb) TO authenticated, service_role;

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
  -- the single source-of-truth balance.
  IF _amount > 0 AND public.xp_award_duplicate_exists(_user_id, _reason, _safe_metadata) THEN
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

  -- Direct profile updates are intentionally blocked by profile-protection
  -- triggers. Use the internal SECURITY DEFINER updater so every inserted XP
  -- ledger row is reflected in profiles.xp exactly once.
  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('xp', _new_balance));

  RETURN _amount;
END;
$function$;

REVOKE ALL ON FUNCTION public.award_xp(uuid,integer,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid,integer,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_user_challenge(_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ch public.challenges;
  _xp int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _ch
  FROM public.challenges
  WHERE id = _challenge_id AND user_id = _uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF COALESCE(array_length(_ch.completed_days, 1), 0) < _ch.duration THEN
    RAISE EXCEPTION 'challenge_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.xp_transactions
    WHERE user_id = _uid
      AND reason = 'challenge_complete'
      AND metadata->>'challenge_id' = _challenge_id::text
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true, 'xp', 0);
  END IF;

  _xp := public.award_xp(
    _uid,
    COALESCE(_ch.reward_xp, 0),
    'challenge_complete',
    jsonb_build_object('challenge_id', _challenge_id)
  );

  RETURN jsonb_build_object('ok', true, 'xp', _xp);
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_user_challenge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_user_challenge(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_winston_challenge(_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ch public.winston_challenges;
  _xp int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _ch
  FROM public.winston_challenges
  WHERE id = _challenge_id AND user_id = _uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF _ch.status NOT IN ('pending','accepted') THEN
    RETURN jsonb_build_object('ok', true, 'already_finished', true, 'status', _ch.status, 'xp', 0);
  END IF;
  IF _ch.expires_at IS NOT NULL AND _ch.expires_at < now() THEN
    UPDATE public.winston_challenges SET status = 'expired' WHERE id = _challenge_id;
    RAISE EXCEPTION 'challenge_expired';
  END IF;

  UPDATE public.winston_challenges
     SET status = 'completed', completed_at = now()
   WHERE id = _challenge_id;

  _xp := public.award_xp(
    _uid,
    COALESCE(_ch.reward_xp, 0),
    'winston_challenge',
    jsonb_build_object('challenge_id', _challenge_id, 'difficulty', _ch.difficulty)
  );

  RETURN jsonb_build_object('ok', true, 'xp', _xp);
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_winston_challenge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_winston_challenge(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_ai_challenge(_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ch public.ai_challenges;
  _xp int := 0;
  _coins int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO _ch
  FROM public.ai_challenges
  WHERE id = _challenge_id AND user_id = _uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;

  IF _ch.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_claimed', true,
      'id', _ch.id,
      'reward_xp', 0,
      'reward_coins', 0,
      'xp', 0,
      'coins', 0
    );
  END IF;

  IF _ch.status NOT IN ('active','accepted','suggested') THEN
    RAISE EXCEPTION 'challenge_not_active';
  END IF;

  UPDATE public.ai_challenges
     SET status = 'completed', completed_at = now()
   WHERE id = _challenge_id;

  _xp := public.award_xp(
    _uid,
    COALESCE(_ch.reward_xp, 0),
    'ai_challenge_complete',
    jsonb_build_object('challenge_id', _challenge_id)
  );

  IF COALESCE(_ch.reward_coins, 0) > 0 THEN
    _coins := public.award_coins(
      _uid,
      COALESCE(_ch.reward_coins, 0),
      'ai_challenge',
      jsonb_build_object('challenge_id', _challenge_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', _ch.id,
    'title', _ch.title,
    'description', _ch.description,
    'difficulty', _ch.difficulty,
    'status', 'completed',
    'reward_xp', _xp,
    'reward_coins', _coins,
    'completed_at', now(),
    'created_at', _ch.created_at,
    'metadata', _ch.metadata,
    'xp', _xp,
    'coins', _coins
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_ai_challenge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_ai_challenge(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_daily_reflection(_prompt text, _response text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _xp_award int := 10;
  _coin_award int := 5;
  _xp_actual int := 0;
  _coins_actual int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _response IS NULL OR length(trim(_response)) < 5 THEN RAISE EXCEPTION 'response_too_short'; END IF;
  IF length(_response) > 2000 THEN RAISE EXCEPTION 'response_too_long'; END IF;

  IF EXISTS (SELECT 1 FROM public.daily_reflections WHERE user_id = _uid AND reflection_date = _today) THEN
    RETURN jsonb_build_object('already_reflected', true, 'xp', 0, 'coins', 0);
  END IF;

  _coins_actual := public.award_coins(_uid, _coin_award, 'reflection', jsonb_build_object('date', _today));
  _xp_actual := public.award_xp(_uid, _xp_award, 'daily_reflection', jsonb_build_object('date', _today));

  INSERT INTO public.daily_reflections(user_id, reflection_date, prompt, response, xp_awarded, coins_awarded)
  VALUES (_uid, _today, COALESCE(_prompt, ''), _response, _xp_actual, _coins_actual);

  RETURN jsonb_build_object('already_reflected', false, 'xp', _xp_actual, 'coins', _coins_actual);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_daily_reflection(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_daily_reflection(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_habit_verification(_habit_id uuid, _completed_date date, _question text, _response text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _xp_award int := 25;
  _coin_award int := 5;
  _xp_actual int := 0;
  _coins_actual int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _response IS NULL OR length(trim(_response)) < 3 THEN RAISE EXCEPTION 'response_too_short'; END IF;
  IF length(_response) > 2000 THEN RAISE EXCEPTION 'response_too_long'; END IF;

  SELECT user_id INTO _owner FROM public.habits WHERE id = _habit_id;
  IF _owner IS NULL OR _owner <> _uid THEN RAISE EXCEPTION 'habit_not_found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.habit_verifications
    WHERE user_id = _uid AND habit_id = _habit_id AND completed_date = _completed_date
  ) THEN
    RETURN jsonb_build_object('already_verified', true, 'xp', 0, 'coins', 0);
  END IF;

  _coins_actual := public.award_coins(_uid, _coin_award, 'verification', jsonb_build_object('habit_id', _habit_id, 'date', _completed_date));
  _xp_actual := public.award_xp(_uid, _xp_award, 'habit_verification', jsonb_build_object('habit_id', _habit_id, 'date', _completed_date));

  INSERT INTO public.habit_verifications(user_id, habit_id, completed_date, question, response, xp_awarded, coins_awarded)
  VALUES (_uid, _habit_id, _completed_date, COALESCE(_question, ''), _response, _xp_actual, _coins_actual);

  RETURN jsonb_build_object('already_verified', false, 'xp', _xp_actual, 'coins', _coins_actual);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_habit_verification(uuid,date,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_habit_verification(uuid,date,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.award_celebration(_kind text, _key text, _xp integer DEFAULT 0, _coins integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _coins_actual int := 0;
  _xp_actual int := 0;
  _xp_clamped int;
  _coins_clamped int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _kind IS NULL OR _key IS NULL OR length(_kind) = 0 OR length(_key) = 0 THEN RAISE EXCEPTION 'invalid_params'; END IF;
  IF _kind NOT IN ('rank','streak','referral','leaderboard','challenge') THEN RAISE EXCEPTION 'invalid_kind'; END IF;

  _xp_clamped := GREATEST(0, LEAST(COALESCE(_xp, 0), 1000));
  _coins_clamped := GREATEST(0, LEAST(COALESCE(_coins, 0), 500));

  IF EXISTS (SELECT 1 FROM public.winston_celebrations WHERE user_id = _uid AND kind = _kind AND key = _key) THEN
    RETURN jsonb_build_object('already_awarded', true, 'xp', 0, 'coins', 0);
  END IF;

  IF _coins_clamped > 0 THEN
    _coins_actual := public.award_coins(_uid, _coins_clamped, 'celebration', jsonb_build_object('kind', _kind, 'key', _key));
  END IF;

  IF _xp_clamped > 0 THEN
    _xp_actual := public.award_xp(_uid, _xp_clamped, 'celebration', jsonb_build_object('kind', _kind, 'key', _key));
  END IF;

  INSERT INTO public.winston_celebrations(user_id, kind, key, xp_awarded, coins_awarded)
  VALUES (_uid, _kind, _key, _xp_actual, _coins_actual);

  RETURN jsonb_build_object('already_awarded', false, 'xp', _xp_actual, 'coins', _coins_actual);
END;
$function$;

REVOKE ALL ON FUNCTION public.award_celebration(text,text,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.award_celebration(text,text,integer,integer) TO authenticated, service_role;

-- Safe one-way reconciliation: only raise profiles.xp when it is behind the
-- existing legitimate ledger. This never creates XP transactions and never
-- lowers a user who is already ahead.
WITH ledger AS (
  SELECT user_id, COALESCE(SUM(delta), 0)::int AS ledger_xp
  FROM public.xp_transactions
  GROUP BY user_id
), behind AS (
  SELECT p.user_id, GREATEST(0, l.ledger_xp) AS reconciled_xp
  FROM public.profiles p
  JOIN ledger l ON l.user_id = p.user_id
  WHERE COALESCE(p.xp, 0) < GREATEST(0, l.ledger_xp)
)
UPDATE public.profiles p
SET xp = b.reconciled_xp,
    updated_at = now()
FROM behind b
WHERE p.user_id = b.user_id;

CREATE OR REPLACE FUNCTION public.xp_sync_snapshot(_user_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, profile_xp integer, ledger_xp integer, discrepancy integer, txn_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ledger AS (
    SELECT user_id, COALESCE(SUM(delta), 0)::int AS ledger_xp, COUNT(*)::int AS txn_count
    FROM public.xp_transactions
    GROUP BY user_id
  )
  SELECT p.user_id,
         COALESCE(p.xp, 0)::int AS profile_xp,
         COALESCE(l.ledger_xp, 0)::int AS ledger_xp,
         (COALESCE(l.ledger_xp, 0) - COALESCE(p.xp, 0))::int AS discrepancy,
         COALESCE(l.txn_count, 0)::int AS txn_count
  FROM public.profiles p
  LEFT JOIN ledger l ON l.user_id = p.user_id
  WHERE _user_id IS NULL OR p.user_id = _user_id;
$function$;

REVOKE ALL ON FUNCTION public.xp_sync_snapshot(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.xp_sync_snapshot(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.xp_award_regression_check(_amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _before int;
  _after int;
  _awarded int;
  _level int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT COALESCE(xp, 0) INTO _before
  FROM public.profiles
  WHERE user_id = _uid
  FOR UPDATE;

  _awarded := public.award_xp(_uid, _amount, _reason, COALESCE(_metadata, '{}'::jsonb));

  SELECT COALESCE(xp, 0) INTO _after
  FROM public.profiles
  WHERE user_id = _uid;

  _level := public.level_from_xp(_after);

  RETURN jsonb_build_object(
    'before', _before,
    'after', _after,
    'awarded', _awarded,
    'delta', _after - _before,
    'level', _level
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.xp_award_regression_check(integer,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.xp_award_regression_check(integer,text,jsonb) TO authenticated, service_role;