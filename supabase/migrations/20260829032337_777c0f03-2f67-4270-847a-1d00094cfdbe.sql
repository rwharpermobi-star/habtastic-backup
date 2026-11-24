-- ============================================================================
-- Phase 10 — server-authoritative economy hardening (forward, idempotent)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Harden the internal primitives themselves (defence in depth)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_service_caller()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT session_user IN ('service_role','supabase_admin','postgres')
      OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role','') = 'service_role';
$$;
REVOKE ALL ON FUNCTION public.is_service_caller() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_service_caller() TO authenticated, service_role;

-- update_profile_internal: previously had NO caller check and NO field
-- stripping, so any authenticated client could self-grant Premium/XP/coins.
CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _svc boolean := public.is_service_caller();
  _u jsonb := COALESCE(_updates, '{}'::jsonb);
  _stripped text[] := '{}';
  _k text;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;

  -- Non-service callers may only ever touch their own row.
  IF NOT _svc THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
    END IF;
    IF auth.uid() <> _user_id THEN
      RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
    END IF;
    -- ...and never economy / entitlement fields.
    FOREACH _k IN ARRAY ARRAY['xp','coins','gems','is_premium','premium_until'] LOOP
      IF _u ? _k THEN
        _stripped := _stripped || _k;
        _u := _u - _k;
      END IF;
    END LOOP;
    IF array_length(_stripped, 1) > 0 THEN
      BEGIN
        INSERT INTO public.profile_audit_log(user_id, event, severity, details)
        VALUES (_user_id, 'economy_field_attempt', 'warn',
                jsonb_build_object('stripped', to_jsonb(_stripped)));
      EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
      END;
    END IF;
  END IF;

  UPDATE public.profiles SET
    is_premium        = COALESCE((_u->>'is_premium')::boolean, is_premium),
    premium_until     = COALESCE((_u->>'premium_until')::timestamptz, premium_until),
    daily_ai_messages = COALESCE((_u->>'daily_ai_messages')::int, daily_ai_messages),
    last_ai_reset     = COALESCE((_u->>'last_ai_reset')::date, last_ai_reset),
    streak_freezes    = COALESCE((_u->>'streak_freezes')::int, streak_freezes),
    freeze_used_dates = CASE WHEN _u ? 'freeze_used_dates'
                             THEN ARRAY(SELECT jsonb_array_elements_text(_u->'freeze_used_dates'))
                             ELSE freeze_used_dates END,
    xp                = COALESCE((_u->>'xp')::int, xp),
    coins             = COALESCE((_u->>'coins')::int, coins),
    gems              = COALESCE((_u->>'gems')::int, gems),
    unlocked_themes   = CASE WHEN _u ? 'unlocked_themes'
                             THEN ARRAY(SELECT jsonb_array_elements_text(_u->'unlocked_themes'))
                             ELSE unlocked_themes END,
    unlocked_effects  = CASE WHEN _u ? 'unlocked_effects'
                             THEN ARRAY(SELECT jsonb_array_elements_text(_u->'unlocked_effects'))
                             ELSE unlocked_effects END,
    updated_at        = now()
  WHERE user_id = _user_id;
END; $function$;

-- award_coins: add the same auth guard award_xp already has.
CREATE OR REPLACE FUNCTION public.award_coins(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _current int; _today_total int; _cap int; _new_balance int; _svc boolean := public.is_service_caller();
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN 0; END IF;

  IF NOT _svc THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
    IF auth.uid() <> _user_id THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  END IF;

  _cap := CASE _reason
    WHEN 'welcome' THEN 100 WHEN 'daily_login' THEN 10 WHEN 'habit_complete' THEN 100
    WHEN 'all_habits_complete' THEN 50 WHEN 'streak_7' THEN 25 WHEN 'streak_30' THEN 50
    WHEN 'streak_100' THEN 100 WHEN 'challenge_complete' THEN 200 WHEN 'daily_chest' THEN 100
    WHEN 'referral_signup' THEN 1000 WHEN 'referral_milestone' THEN 10000
    WHEN 'verification' THEN 50 WHEN 'reflection' THEN 10 WHEN 'celebration' THEN 500
    WHEN 'surprise_reward' THEN 200
    ELSE NULL END;
  IF _cap IS NOT NULL THEN
    SELECT COALESCE(SUM(delta), 0) INTO _today_total FROM public.coin_transactions
    WHERE user_id = _user_id AND reason = _reason AND created_at::date = (now() AT TIME ZONE 'UTC')::date;
    IF _today_total >= _cap THEN RETURN 0; END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;
  IF _reason = 'welcome' THEN
    IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE user_id = _user_id AND reason = 'welcome') THEN RETURN 0; END IF;
  END IF;
  SELECT COALESCE(coins, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF _current IS NULL THEN RETURN 0; END IF;
  _new_balance := _current + _amount;
  UPDATE public.profiles SET coins = _new_balance, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);
  RETURN _amount;
END; $function$;

-- award_xp: allow the streak-shield purchase debit as an explicit negative reason.
CREATE OR REPLACE FUNCTION public.award_xp(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _current int; _today_total int; _cap int; _new_balance int;
  _allow_negative boolean := false;
  _is_service_role boolean := public.is_service_caller();
  _safe_metadata jsonb := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount = 0 THEN RETURN 0; END IF;

  IF auth.uid() IS NULL AND NOT _is_service_role THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  _cap := CASE _reason
    WHEN 'habit_complete' THEN 200 WHEN 'habit_undo' THEN 200
    WHEN 'habit_verification' THEN 75 WHEN 'challenge_day' THEN 100
    WHEN 'challenge_complete' THEN 500 WHEN 'community_challenge' THEN 500
    WHEN 'winston_challenge' THEN 500 WHEN 'winston_challenge_complete' THEN 500
    WHEN 'ai_challenge_complete' THEN 500 WHEN 'ai_challenge' THEN 500
    WHEN 'journal_write' THEN 60 WHEN 'journal_voice' THEN 80
    WHEN 'journal_ai_feedback' THEN 40 WHEN 'streak_7' THEN 50
    WHEN 'streak_30' THEN 100 WHEN 'referral' THEN 1000
    WHEN 'surprise_reward' THEN 200 WHEN 'daily_reflection' THEN 30
    ELSE NULL END;

  _allow_negative := _reason IN ('habit_undo','streak_shield_purchase');
  IF _amount < 0 AND NOT _allow_negative THEN
    RAISE EXCEPTION 'negative_xp_not_allowed';
  END IF;

  IF public.xp_award_duplicate_exists(_user_id, _reason, _safe_metadata) THEN RETURN 0; END IF;

  IF _cap IS NOT NULL AND _amount > 0 THEN
    SELECT COALESCE(SUM(delta), 0) INTO _today_total FROM public.xp_transactions
    WHERE user_id = _user_id AND reason = _reason AND delta > 0
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;
    IF _today_total >= _cap THEN RETURN 0; END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;

  SELECT COALESCE(xp, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF _current IS NULL THEN RETURN 0; END IF;
  _new_balance := GREATEST(0, _current + _amount);

  UPDATE public.profiles SET xp = _new_balance, updated_at = now() WHERE user_id = _user_id;
  INSERT INTO public.xp_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _safe_metadata, _new_balance);
  RETURN _amount;
END; $function$;

-- ---------------------------------------------------------------------------
-- 1. Server-owned reward price list
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_rules (
  action        text PRIMARY KEY,
  xp            integer NOT NULL DEFAULT 0,
  coins         integer NOT NULL DEFAULT 0,
  gems          integer NOT NULL DEFAULT 0,
  xp_reason     text,
  coin_reason   text,
  dedupe_daily  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.reward_rules FROM anon, authenticated;
GRANT SELECT ON public.reward_rules TO anon, authenticated;
GRANT ALL ON public.reward_rules TO service_role;
ALTER TABLE public.reward_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reward_rules' AND policyname='reward_rules_read') THEN
    CREATE POLICY reward_rules_read ON public.reward_rules FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reward_rules' AND policyname='reward_rules_service_write') THEN
    CREATE POLICY reward_rules_service_write ON public.reward_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.reward_rules(action, xp, coins, gems, xp_reason, coin_reason, dedupe_daily) VALUES
  ('journal_write',        15,  0,  0, 'journal_write',       NULL,                 false),
  ('journal_voice',        20,  0,  0, 'journal_voice',       NULL,                 false),
  ('journal_ai_feedback',  10,  0,  0, 'journal_ai_feedback', NULL,                 false),
  ('challenge_day',        15, 10,  0, 'challenge_day',       'challenge_complete', true),
  ('streak_7',             50, 25,  0, 'streak_7',            'streak_7',           true),
  ('streak_30',           100, 50,  0, 'streak_30',           'streak_30',          true),
  ('streak_100',            0,100,  0, NULL,                  'streak_100',         true),
  ('referral',            100,  0,  0, 'referral',            NULL,                 true),
  ('daily_login',           0, 10,  0, NULL,                  'daily_login',        true),
  ('daily_reflection',     10,  0,  0, 'daily_reflection',    NULL,                 true),
  ('habit_verification',   15,  0,  0, 'habit_verification',  NULL,                 true),
  ('gem_weekly_consistency',0, 0,  5, NULL,                   NULL,                 true),
  ('gem_challenge_complete',0, 0, 20, NULL,                   NULL,                 true),
  ('gem_level_up',          0, 0, 10, NULL,                   NULL,                 true)
ON CONFLICT (action) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Gem ledger + internal gem primitive
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gem_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  delta         integer NOT NULL,
  reason        text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gem_transactions_user_created_idx
  ON public.gem_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gem_transactions_daily_unique
  ON public.gem_transactions(user_id, reason, (metadata->>'date'))
  WHERE metadata ? 'date';
REVOKE ALL ON public.gem_transactions FROM anon, authenticated;
GRANT SELECT ON public.gem_transactions TO authenticated;
GRANT ALL ON public.gem_transactions TO service_role;
ALTER TABLE public.gem_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gem_transactions' AND policyname='gem_tx_own_read') THEN
    CREATE POLICY gem_tx_own_read ON public.gem_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gem_transactions' AND policyname='gem_tx_no_client_write') THEN
    CREATE POLICY gem_tx_no_client_write ON public.gem_transactions AS RESTRICTIVE
      FOR INSERT TO anon, authenticated WITH CHECK (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gem_transactions' AND policyname='gem_tx_no_client_update') THEN
    CREATE POLICY gem_tx_no_client_update ON public.gem_transactions AS RESTRICTIVE
      FOR UPDATE TO anon, authenticated USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='gem_transactions' AND policyname='gem_tx_no_client_delete') THEN
    CREATE POLICY gem_tx_no_client_delete ON public.gem_transactions AS RESTRICTIVE
      FOR DELETE TO anon, authenticated USING (false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.adjust_gems_internal(_user_id uuid, _delta integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _current int; _new int;
BEGIN
  IF _user_id IS NULL OR _delta IS NULL OR _delta = 0 THEN RETURN 0; END IF;
  SELECT COALESCE(gems, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF _current IS NULL THEN RETURN 0; END IF;
  IF _delta < 0 AND _current + _delta < 0 THEN RETURN 0; END IF;
  _new := _current + _delta;
  BEGIN
    INSERT INTO public.gem_transactions(user_id, delta, reason, metadata, balance_after)
    VALUES (_user_id, _delta, _reason, COALESCE(_metadata,'{}'::jsonb), _new);
  EXCEPTION WHEN unique_violation THEN
    RETURN 0; -- already claimed for this (reason, date)
  END;
  UPDATE public.profiles SET gems = _new, updated_at = now() WHERE user_id = _user_id;
  RETURN _delta;
END; $$;
REVOKE ALL ON FUNCTION public.adjust_gems_internal(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_gems_internal(uuid, integer, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. User-facing, server-authoritative reward claim
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_action_reward(_action text, _ref_id uuid DEFAULT NULL, _ref_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.reward_rules;
  _xp int := 0; _coins int := 0; _gems int := 0;
  _today text := ((now() AT TIME ZONE 'utc')::date)::text;
  _md jsonb;
  _habit record;
  _base_xp int; _base_coins int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _action IS NULL OR length(_action) > 64 THEN RAISE EXCEPTION 'invalid_action'; END IF;

  IF _action IN ('habit_complete','habit_undo') THEN
    IF _ref_id IS NULL THEN RAISE EXCEPTION 'habit_required'; END IF;
    SELECT id, difficulty, COALESCE(completions,'{}'::text[]) AS completions
      INTO _habit FROM public.habits WHERE id = _ref_id AND user_id = _uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'habit_not_found'; END IF;

    _base_xp    := CASE _habit.difficulty WHEN 'easy' THEN 5 WHEN 'hard' THEN 20 ELSE 10 END;
    _base_coins := CASE _habit.difficulty WHEN 'easy' THEN 3 WHEN 'hard' THEN 10 ELSE 5 END;
    _md := jsonb_build_object('habit_id', _ref_id::text, 'date', _today, 'source', 'claim_action_reward');

    IF _action = 'habit_complete' THEN
      -- Reward only when the saved habit really is completed today.
      IF NOT (_habit.completions @> ARRAY[_today]) THEN RAISE EXCEPTION 'habit_not_completed_today'; END IF;
      _xp    := public.award_xp(_uid, _base_xp, 'habit_complete', _md);
      _coins := public.award_coins(_uid, _base_coins, 'habit_complete', _md);
    ELSE
      IF _habit.completions @> ARRAY[_today] THEN RAISE EXCEPTION 'habit_still_completed_today'; END IF;
      _xp := public.award_xp(_uid, -_base_xp, 'habit_undo', _md);
    END IF;
    RETURN jsonb_build_object('xp', _xp, 'coins', _coins, 'gems', 0);
  END IF;

  SELECT * INTO _r FROM public.reward_rules WHERE action = _action;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_action'; END IF;

  _md := jsonb_build_object('source', 'claim_action_reward');
  IF _ref_key IS NOT NULL THEN _md := _md || jsonb_build_object('ref_key', left(_ref_key, 120)); END IF;
  IF _ref_id  IS NOT NULL THEN _md := _md || jsonb_build_object('ref_id', _ref_id::text); END IF;
  IF _r.dedupe_daily THEN _md := _md || jsonb_build_object('date', _today); END IF;

  IF _r.xp    > 0 AND _r.xp_reason   IS NOT NULL THEN _xp    := public.award_xp(_uid, _r.xp, _r.xp_reason, _md); END IF;
  IF _r.coins > 0 AND _r.coin_reason IS NOT NULL THEN _coins := public.award_coins(_uid, _r.coins, _r.coin_reason, _md); END IF;
  IF _r.gems  > 0 THEN _gems := public.adjust_gems_internal(_uid, _r.gems, _action, _md); END IF;

  RETURN jsonb_build_object('xp', _xp, 'coins', _coins, 'gems', _gems);
END; $$;
REVOKE ALL ON FUNCTION public.claim_action_reward(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_action_reward(text, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Surprise reward — the roll happens on the server
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roll_surprise_reward()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _roll numeric; _pick numeric;
  _type text; _amount int; _rarity text;
  _awarded int := 0;
  _held int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  BEGIN
    PERFORM public.rate_limit_check('surprise_roll', 86400, 60);
  EXCEPTION WHEN undefined_function THEN NULL;
  END;

  IF random() > 0.4 THEN RETURN jsonb_build_object('reward', NULL); END IF;

  _pick := random() * 100;
  IF    _pick < 50 THEN _type := 'xp'; _amount := 10;  _rarity := 'common';
  ELSIF _pick < 80 THEN _type := 'xp'; _amount := 25;  _rarity := 'common';
  ELSIF _pick < 95 THEN _type := 'xp'; _amount := 50;  _rarity := 'rare';
  ELSIF _pick < 99 THEN _type := 'xp'; _amount := 100; _rarity := 'epic';
  ELSE                  _type := 'streak_freeze'; _amount := 1; _rarity := 'legendary';
  END IF;

  IF _type = 'xp' THEN
    _awarded := public.award_xp(_uid, _amount, 'surprise_reward',
                  jsonb_build_object('rarity', _rarity, 'source', 'roll_surprise_reward'));
    IF _awarded <= 0 THEN RETURN jsonb_build_object('reward', NULL); END IF;
    _amount := _awarded;
  ELSE
    SELECT COALESCE(streak_freezes, 0) INTO _held FROM public.profiles WHERE user_id = _uid FOR UPDATE;
    IF _held IS NULL OR _held >= 3 THEN RETURN jsonb_build_object('reward', NULL); END IF;
    UPDATE public.profiles SET streak_freezes = _held + 1, updated_at = now() WHERE user_id = _uid;
  END IF;

  RETURN jsonb_build_object('reward',
    jsonb_build_object('type', _type, 'amount', _amount, 'rarity', _rarity));
END; $$;
REVOKE ALL ON FUNCTION public.roll_surprise_reward() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_surprise_reward() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Streak shield — Premium + rolling-week limits enforced server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_premium(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    p.is_premium AND (p.premium_until IS NULL OR p.premium_until > now())
    OR (p.trial_started_at IS NOT NULL AND p.trial_started_at > now() - interval '7 days'),
  false)
  FROM public.profiles p WHERE p.user_id = _user_id;
$$;
REVOKE ALL ON FUNCTION public.user_is_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_premium(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.use_streak_shield(_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _target date := COALESCE(_date, (now() AT TIME ZONE 'utc')::date);
  _held int; _dates text[]; _used_week int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _target > _today OR _target < _today - 1 THEN RAISE EXCEPTION 'invalid_date'; END IF;
  IF NOT public.user_is_premium(_uid) THEN RAISE EXCEPTION 'premium_required'; END IF;

  SELECT COALESCE(streak_freezes, 0), COALESCE(freeze_used_dates, '{}'::text[])
    INTO _held, _dates FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF _held IS NULL THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF _held <= 0 THEN RAISE EXCEPTION 'no_shields_available'; END IF;
  IF _dates @> ARRAY[_target::text] THEN RAISE EXCEPTION 'already_shielded'; END IF;

  SELECT count(*) INTO _used_week FROM unnest(_dates) d
   WHERE d ~ '^\d{4}-\d{2}-\d{2}$' AND d::date >= _today - 7;
  IF _used_week >= 2 THEN RAISE EXCEPTION 'weekly_limit_reached'; END IF;

  UPDATE public.profiles
     SET streak_freezes = _held - 1,
         freeze_used_dates = _dates || ARRAY[_target::text],
         updated_at = now()
   WHERE user_id = _uid;

  RETURN jsonb_build_object('ok', true, 'shields_left', _held - 1, 'date', _target::text);
END; $$;
REVOKE ALL ON FUNCTION public.use_streak_shield(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_streak_shield(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buy_streak_shield()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _held int; _xp int; _spent int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT public.user_is_premium(_uid) THEN RAISE EXCEPTION 'premium_required'; END IF;

  SELECT COALESCE(streak_freezes,0), COALESCE(xp,0) INTO _held, _xp
    FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF _held IS NULL THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF _held >= 3 THEN RAISE EXCEPTION 'max_shields_held'; END IF;
  IF _xp < 50 THEN RAISE EXCEPTION 'insufficient_xp'; END IF;

  _spent := public.award_xp(_uid, -50, 'streak_shield_purchase',
              jsonb_build_object('source','buy_streak_shield','ts', extract(epoch from now())::bigint));
  IF _spent = 0 THEN RAISE EXCEPTION 'xp_debit_failed'; END IF;

  UPDATE public.profiles SET streak_freezes = _held + 1, updated_at = now() WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'shields', _held + 1, 'xp_spent', 50);
END; $$;
REVOKE ALL ON FUNCTION public.buy_streak_shield() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_streak_shield() TO authenticated, service_role;

-- Automatic single-day rescue (no shield consumed) — max 2 per rolling week.
CREATE OR REPLACE FUNCTION public.auto_save_streak_day(_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _dates text[]; _used_week int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _date IS NULL OR _date > _today - 1 OR _date < _today - 2 THEN RAISE EXCEPTION 'invalid_date'; END IF;

  SELECT COALESCE(freeze_used_dates, '{}'::text[]) INTO _dates
    FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF _dates IS NULL THEN RAISE EXCEPTION 'profile_missing'; END IF;
  IF _dates @> ARRAY[_date::text] THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_saved'); END IF;

  SELECT count(*) INTO _used_week FROM unnest(_dates) d
   WHERE d ~ '^\d{4}-\d{2}-\d{2}$' AND d::date >= _today - 7;
  IF _used_week >= 2 THEN RETURN jsonb_build_object('ok', false, 'reason', 'weekly_limit_reached'); END IF;

  UPDATE public.profiles
     SET freeze_used_dates = _dates || ARRAY[_date::text], updated_at = now()
   WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'date', _date::text, 'used_this_week', _used_week + 1);
END; $$;
REVOKE ALL ON FUNCTION public.auto_save_streak_day(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_save_streak_day(date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. AI message metering, coin/gem spending
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_ai_message()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used int; _reset date; _limit int := 10; _premium boolean;
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

CREATE OR REPLACE FUNCTION public.spend_my_coins(_amount integer, _reason text DEFAULT 'spend_misc')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN RETURN false; END IF;
  RETURN COALESCE(public.spend_coins(_uid, _amount, COALESCE(left(_reason,64),'spend_misc'), '{}'::jsonb), false);
END; $$;
REVOKE ALL ON FUNCTION public.spend_my_coins(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_my_coins(integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.spend_my_gems(_amount integer, _reason text DEFAULT 'spend_misc')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _delta int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000000 THEN RETURN false; END IF;
  _delta := public.adjust_gems_internal(_uid, -_amount, COALESCE(left(_reason,64),'spend_misc'),
              jsonb_build_object('ts', extract(epoch from now())::bigint));
  RETURN _delta < 0;
END; $$;
REVOKE ALL ON FUNCTION public.spend_my_gems(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_my_gems(integer, text) TO authenticated, service_role;

-- Narrow replacement for the client's old update_profile_internal usage.
CREATE OR REPLACE FUNCTION public.update_my_profile_state(_updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _u jsonb := COALESCE(_updates,'{}'::jsonb);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.profiles SET
    trial_started_at = CASE
      WHEN _u ? 'trial_started_at' AND trial_started_at IS NULL
        THEN COALESCE((_u->>'trial_started_at')::timestamptz, now())
      ELSE trial_started_at END,
    updated_at = now()
  WHERE user_id = _uid;
END; $$;
REVOKE ALL ON FUNCTION public.update_my_profile_state(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile_state(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Revoke the privileged primitives from clients
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_profile_internal',
        'award_xp',
        'award_coins',
        'spend_coins',
        'award_celebration',
        'qualify_referral_payment'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Belt and braces: economy/entitlement columns are not client-updatable.
DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE (xp, coins, gems, is_premium, premium_until) ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE UPDATE (xp, coins, gems, is_premium, premium_until) ON public.profiles FROM anon';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;