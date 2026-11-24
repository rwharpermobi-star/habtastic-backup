
-- ============================================================
-- Phase 9.3 — Security Hardening
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_service_role boolean;
  _caller_role text;
  _headers jsonb;
  _ip text;
  _ua text;
  _req_id text;
  _attempted text[];
  _stripped text[] := ARRAY[]::text[];
  _had_premium_attempt boolean := false;
  _had_economy_attempt boolean := false;
  _economy_field text;
  _economy_fields text[] := ARRAY[
    'xp','coins','gems','streak_freezes','freeze_used_dates',
    'unlocked_themes','unlocked_effects',
    'ai_avatar_credits_used','ai_avatar_credits_reset_at',
    'daily_ai_messages','last_ai_reset','trial_started_at'
  ];
BEGIN
  _is_service_role := (
    current_setting('role', true) = 'service_role'
    OR current_user = 'supabase_admin'
    OR current_user = 'postgres'
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
    _stripped := _stripped || ARRAY['is_premium','premium_until'];
    _updates := _updates - 'is_premium' - 'premium_until';
  END IF;

  IF NOT _is_service_role THEN
    FOREACH _economy_field IN ARRAY _economy_fields LOOP
      IF _updates ? _economy_field THEN
        _had_economy_attempt := true;
        _stripped := _stripped || _economy_field;
        _updates := _updates - _economy_field;
      END IF;
    END LOOP;
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
      (_user_id, auth.uid(), _caller_role, 'premium_attempt', 'alert', _attempted,
       jsonb_build_object('stripped', _stripped), _ip, _ua, _req_id);
  END IF;

  IF _had_economy_attempt THEN
    INSERT INTO public.profile_audit_log
      (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
    VALUES
      (_user_id, auth.uid(), _caller_role, 'economy_field_attempt', 'warn', _attempted,
       jsonb_build_object('stripped', _stripped), _ip, _ua, _req_id);
  END IF;
END;
$function$;

-- ---------- 2. XP ledger + award_xp ----------
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  balance_after integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.xp_transactions TO authenticated;
GRANT ALL ON public.xp_transactions TO service_role;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own xp transactions" ON public.xp_transactions;
CREATE POLICY "Users read own xp transactions" ON public.xp_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Block client inserts on xp_transactions" ON public.xp_transactions;
CREATE POLICY "Block client inserts on xp_transactions" ON public.xp_transactions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Block client updates on xp_transactions" ON public.xp_transactions;
CREATE POLICY "Block client updates on xp_transactions" ON public.xp_transactions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Block client deletes on xp_transactions" ON public.xp_transactions;
CREATE POLICY "Block client deletes on xp_transactions" ON public.xp_transactions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

CREATE UNIQUE INDEX IF NOT EXISTS xp_habit_complete_unique
  ON public.xp_transactions (user_id, (metadata->>'habit_id'), (metadata->>'date'))
  WHERE reason IN ('habit_complete','habit_undo');

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
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount = 0 THEN RETURN 0; END IF;
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

REVOKE ALL ON FUNCTION public.award_xp(uuid,integer,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid,integer,text,jsonb) TO authenticated, service_role;

-- ---------- 3. Lock weekly_scores + server submit ----------
DO $$ BEGIN
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.weekly_scores FROM authenticated, anon';
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "Block client writes weekly_scores" ON public.weekly_scores;
CREATE POLICY "Block client writes weekly_scores" ON public.weekly_scores
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.submit_weekly_score()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _week_start date;
  _name text;
  _avatar text;
  _xp int;
  _habits_total int;
  _habits_completed int := 0;
  _perfect_days int := 0;
  _best_streak int := 0;
  _active_days int := 0;
  _avg_rate int := 0;
  _growth int;
  _grade text;
  _day_rate int;
  _completed_on_day int;
  _i int;
  _d date;
  _d_str text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _week_start := (date_trunc('week', (now() AT TIME ZONE 'UTC')::date))::date;

  SELECT COALESCE(name,'Hero'), avatar_url, COALESCE(xp,0) INTO _name, _avatar, _xp
  FROM public.profiles WHERE user_id = _uid;

  SELECT COUNT(*) INTO _habits_total FROM public.habits WHERE user_id = _uid;
  IF _habits_total = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_habits');
  END IF;

  FOR _i IN 0..6 LOOP
    _d := (now() AT TIME ZONE 'UTC')::date - _i;
    _d_str := to_char(_d, 'YYYY-MM-DD');
    SELECT COUNT(*) INTO _completed_on_day FROM public.habits
      WHERE user_id = _uid AND _d_str = ANY(completions);
    _habits_completed := _habits_completed + _completed_on_day;
    IF _completed_on_day > 0 THEN _active_days := _active_days + 1; END IF;
    _day_rate := CASE WHEN _habits_total > 0
                      THEN round((_completed_on_day::numeric / _habits_total) * 100)::int
                      ELSE 0 END;
    IF _day_rate = 100 THEN _perfect_days := _perfect_days + 1; END IF;
    _avg_rate := _avg_rate + _day_rate;
  END LOOP;
  _avg_rate := round(_avg_rate::numeric / 7)::int;

  SELECT COALESCE(MAX(array_length(completions, 1)), 0) INTO _best_streak
    FROM public.habits WHERE user_id = _uid;

  _growth := LEAST(100, round(
    _avg_rate * 0.35
    + _perfect_days * 8
    + _best_streak * 2.5
    + _active_days * 3
    + ((_xp / 100) + 1) * 2
  )::int);

  _grade := CASE
    WHEN _growth >= 90 THEN 'S'
    WHEN _growth >= 75 THEN 'A'
    WHEN _growth >= 60 THEN 'B'
    WHEN _growth >= 40 THEN 'C'
    ELSE 'D'
  END;

  INSERT INTO public.weekly_scores
    (user_id, week_start, display_name, avatar_url,
     growth_score, grade, habits_completed, total_habits, best_streak, perfect_days)
  VALUES
    (_uid, _week_start, _name, _avatar,
     _growth, _grade, _habits_completed, _habits_total, _best_streak, _perfect_days)
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    growth_score = EXCLUDED.growth_score,
    grade = EXCLUDED.grade,
    habits_completed = EXCLUDED.habits_completed,
    total_habits = EXCLUDED.total_habits,
    best_streak = EXCLUDED.best_streak,
    perfect_days = EXCLUDED.perfect_days,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'growth_score', _growth, 'grade', _grade);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_weekly_score() FROM public;
GRANT EXECUTE ON FUNCTION public.submit_weekly_score() TO authenticated, service_role;

-- ---------- 4. Premium grants ledger ----------
CREATE TABLE IF NOT EXISTS public.premium_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paystack_event_id text,
  paystack_reference text,
  kind text NOT NULL,
  premium_until timestamptz,
  amount integer,
  currency text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS premium_grants_event_unique
  ON public.premium_grants (paystack_event_id) WHERE paystack_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS premium_grants_ref_unique
  ON public.premium_grants (paystack_reference, kind) WHERE paystack_reference IS NOT NULL;
GRANT SELECT ON public.premium_grants TO authenticated;
GRANT ALL ON public.premium_grants TO service_role;
ALTER TABLE public.premium_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own premium grants" ON public.premium_grants;
CREATE POLICY "Users read own premium grants" ON public.premium_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Block client writes premium_grants" ON public.premium_grants;
CREATE POLICY "Block client writes premium_grants" ON public.premium_grants
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ---------- 5. Challenge payouts ----------
CREATE TABLE IF NOT EXISTS public.challenge_payouts (
  challenge_kind text NOT NULL,
  challenge_id uuid NOT NULL,
  user_id uuid NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_kind, challenge_id, user_id)
);
GRANT SELECT ON public.challenge_payouts TO authenticated;
GRANT ALL ON public.challenge_payouts TO service_role;
ALTER TABLE public.challenge_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own payouts" ON public.challenge_payouts;
CREATE POLICY "Users read own payouts" ON public.challenge_payouts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Block client writes payouts" ON public.challenge_payouts;
CREATE POLICY "Block client writes payouts" ON public.challenge_payouts
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.complete_user_challenge(_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ch record;
  _xp int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _ch FROM public.challenges WHERE id = _challenge_id AND user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF COALESCE(array_length(_ch.completed_days, 1), 0) < _ch.duration THEN
    RAISE EXCEPTION 'challenge_incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM public.challenge_payouts
              WHERE challenge_kind = 'user' AND challenge_id = _challenge_id AND user_id = _uid) THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true);
  END IF;

  _xp := public.award_xp(_uid, COALESCE(_ch.reward_xp, 0), 'challenge_complete',
                         jsonb_build_object('challenge_id', _challenge_id));
  INSERT INTO public.challenge_payouts(challenge_kind, challenge_id, user_id, xp_awarded)
  VALUES ('user', _challenge_id, _uid, _xp);

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
  _ch record;
  _xp int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _ch FROM public.winston_challenges
   WHERE id = _challenge_id AND user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF _ch.status NOT IN ('pending','accepted') THEN
    RETURN jsonb_build_object('ok', true, 'already_finished', true, 'status', _ch.status);
  END IF;
  IF _ch.expires_at IS NOT NULL AND _ch.expires_at < now() THEN
    UPDATE public.winston_challenges SET status = 'expired' WHERE id = _challenge_id;
    RAISE EXCEPTION 'challenge_expired';
  END IF;

  UPDATE public.winston_challenges
     SET status = 'completed', completed_at = now()
   WHERE id = _challenge_id;

  IF NOT EXISTS (SELECT 1 FROM public.challenge_payouts
                  WHERE challenge_kind = 'winston' AND challenge_id = _challenge_id AND user_id = _uid) THEN
    _xp := public.award_xp(_uid, COALESCE(_ch.reward_xp, 0), 'winston_challenge',
                           jsonb_build_object('challenge_id', _challenge_id, 'difficulty', _ch.difficulty));
    INSERT INTO public.challenge_payouts(challenge_kind, challenge_id, user_id, xp_awarded)
    VALUES ('winston', _challenge_id, _uid, _xp);
  END IF;

  RETURN jsonb_build_object('ok', true, 'xp', _xp);
END;
$function$;
REVOKE ALL ON FUNCTION public.complete_winston_challenge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_winston_challenge(uuid) TO authenticated, service_role;

-- ---------- 6. Referral code RPC + lock writes ----------
CREATE OR REPLACE FUNCTION public.create_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing text;
  _code text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _i int;
  _tries int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT referral_code INTO _existing
  FROM public.referrals
  WHERE referrer_id = _uid AND referred_id IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  LOOP
    _tries := _tries + 1;
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.referrals(referrer_id, referral_code) VALUES (_uid, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _tries > 10 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_referral_code() FROM public;
GRANT EXECUTE ON FUNCTION public.create_referral_code() TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can insert referrals" ON public.referrals;
DROP POLICY IF EXISTS "Users insert own referrals" ON public.referrals;
DROP POLICY IF EXISTS "Block client writes referrals" ON public.referrals;
CREATE POLICY "Block client writes referrals" ON public.referrals
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Block client updates referrals" ON public.referrals;
CREATE POLICY "Block client updates referrals" ON public.referrals
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Block client deletes referrals" ON public.referrals;
CREATE POLICY "Block client deletes referrals" ON public.referrals
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- ---------- 7. Rate limiting ----------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  user_id uuid NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Block client access rate_limits" ON public.rate_limits;
CREATE POLICY "Block client access rate_limits" ON public.rate_limits
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.rate_limit_check(_action text, _window_seconds int, _max int)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _bucket timestamptz;
  _cur int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  _bucket := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  INSERT INTO public.rate_limits(user_id, action, window_start, count)
  VALUES (_uid, _action, _bucket, 1)
  ON CONFLICT (user_id, action, window_start) DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _cur;
  IF _cur > _max THEN
    INSERT INTO public.profile_audit_log(user_id, auth_uid, caller_role, event_type, severity, attempted_fields)
    VALUES (_uid, _uid, 'authenticated', 'rate_limited', 'warn', ARRAY[_action]);
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.rate_limit_check(text,int,int) FROM public;
GRANT EXECUTE ON FUNCTION public.rate_limit_check(text,int,int) TO authenticated, service_role;

-- ---------- 8. Premium gate helper ----------
CREATE OR REPLACE FUNCTION public.require_premium()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _ok boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT (is_premium = true AND (premium_until IS NULL OR premium_until > now()))
    INTO _ok FROM public.profiles WHERE user_id = _uid;
  IF NOT COALESCE(_ok, false) THEN
    RAISE EXCEPTION 'premium_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN true;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.require_premium() TO authenticated, service_role;

-- ---------- 9. Retention jobs ----------
CREATE OR REPLACE FUNCTION public.run_retention_jobs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _result jsonb := '{}'::jsonb; _n int;
BEGIN
  DELETE FROM public.paystack_webhook_events WHERE received_at < now() - interval '180 days';
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('paystack_webhook_events', _n);

  DELETE FROM public.profile_audit_log
    WHERE created_at < now() - interval '90 days' AND severity IN ('info','warn');
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('profile_audit_log_iw', _n);

  DELETE FROM public.profile_audit_log
    WHERE created_at < now() - interval '365 days' AND severity = 'alert';
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('profile_audit_log_alert', _n);

  DELETE FROM public.referral_signals WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('referral_signals', _n);

  DELETE FROM public.community_feed
    WHERE hidden_at IS NOT NULL AND hidden_at < now() - interval '30 days';
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('community_feed_hidden', _n);

  DELETE FROM public.notifications
    WHERE read_at IS NOT NULL AND read_at < now() - interval '30 days';
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('notifications', _n);

  DELETE FROM public.rate_limits WHERE window_start < now() - interval '7 days';
  GET DIAGNOSTICS _n = ROW_COUNT; _result := _result || jsonb_build_object('rate_limits', _n);

  RETURN _result;
END;
$function$;
REVOKE ALL ON FUNCTION public.run_retention_jobs() FROM public;
GRANT EXECUTE ON FUNCTION public.run_retention_jobs() TO service_role;

-- ---------- 10. Column-level REVOKE on profiles ----------
DO $$ BEGIN
  EXECUTE 'REVOKE UPDATE (xp, coins, gems, is_premium, premium_until, streak_freezes, freeze_used_dates, unlocked_themes, unlocked_effects, daily_ai_messages, last_ai_reset, trial_started_at, ai_avatar_credits_used, ai_avatar_credits_reset_at) ON public.profiles FROM authenticated';
EXCEPTION WHEN others THEN NULL; END $$;
