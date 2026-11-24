
-- ============================================================
-- Phase 5 — Winston Coach: Verification, Reflection, Celebrations
-- ============================================================

-- 1) Habits: per-habit verification opt-in
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS verification_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_question text;

-- 2) habit_verifications
CREATE TABLE IF NOT EXISTS public.habit_verifications (
  user_id uuid NOT NULL,
  habit_id uuid NOT NULL,
  completed_date date NOT NULL,
  question text NOT NULL,
  response text NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, habit_id, completed_date)
);

GRANT SELECT ON public.habit_verifications TO authenticated;
GRANT ALL ON public.habit_verifications TO service_role;

ALTER TABLE public.habit_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own verifications"
  ON public.habit_verifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client writes verifications"
  ON public.habit_verifications AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 3) daily_reflections
CREATE TABLE IF NOT EXISTS public.daily_reflections (
  user_id uuid NOT NULL,
  reflection_date date NOT NULL,
  prompt text NOT NULL,
  response text NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reflection_date)
);

GRANT SELECT ON public.daily_reflections TO authenticated;
GRANT ALL ON public.daily_reflections TO service_role;

ALTER TABLE public.daily_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reflections"
  ON public.daily_reflections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client writes reflections"
  ON public.daily_reflections AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 4) winston_celebrations
CREATE TABLE IF NOT EXISTS public.winston_celebrations (
  user_id uuid NOT NULL,
  kind text NOT NULL,            -- 'rank' | 'streak' | 'referral' | 'leaderboard' | 'challenge'
  key text NOT NULL,             -- e.g. 'streak_30', 'rank_silver'
  xp_awarded integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, key)
);

GRANT SELECT ON public.winston_celebrations TO authenticated;
GRANT ALL ON public.winston_celebrations TO service_role;

ALTER TABLE public.winston_celebrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own celebrations"
  ON public.winston_celebrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client writes celebrations"
  ON public.winston_celebrations AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ============================================================
-- Update award_coins caps to include new Phase 5 reasons
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_coins(
  _user_id uuid,
  _amount integer,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current int;
  _today_total int;
  _cap int;
  _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN 0;
  END IF;

  _cap := CASE _reason
    WHEN 'welcome'              THEN 100
    WHEN 'daily_login'          THEN 10
    WHEN 'habit_complete'       THEN 100
    WHEN 'all_habits_complete'  THEN 50
    WHEN 'streak_7'             THEN 25
    WHEN 'streak_30'            THEN 50
    WHEN 'streak_100'           THEN 100
    WHEN 'challenge_complete'   THEN 200
    WHEN 'daily_chest'          THEN 100
    WHEN 'referral_signup'      THEN 1000
    WHEN 'referral_milestone'   THEN 10000
    WHEN 'verification'         THEN 50
    WHEN 'reflection'           THEN 10
    WHEN 'celebration'          THEN 500
    ELSE NULL
  END;

  IF _cap IS NOT NULL THEN
    SELECT COALESCE(SUM(delta), 0) INTO _today_total
    FROM public.coin_transactions
    WHERE user_id = _user_id
      AND reason = _reason
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;

    IF _today_total >= _cap THEN
      RETURN 0;
    END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;

  IF _reason = 'welcome' THEN
    IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE user_id = _user_id AND reason = 'welcome') THEN
      RETURN 0;
    END IF;
  END IF;

  SELECT COALESCE(coins, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  _new_balance := _current + _amount;

  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('coins', _new_balance));

  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);

  RETURN _amount;
END;
$$;

-- ============================================================
-- submit_habit_verification — +25 XP / +5 coins, idempotent per day
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_habit_verification(
  _habit_id uuid,
  _completed_date date,
  _question text,
  _response text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _xp_award int := 25;
  _coin_award int := 5;
  _coins_actual int := 0;
  _current_xp int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _response IS NULL OR length(trim(_response)) < 3 THEN
    RAISE EXCEPTION 'response_too_short';
  END IF;
  IF length(_response) > 2000 THEN
    RAISE EXCEPTION 'response_too_long';
  END IF;

  SELECT user_id INTO _owner FROM public.habits WHERE id = _habit_id;
  IF _owner IS NULL OR _owner <> _uid THEN
    RAISE EXCEPTION 'habit_not_found';
  END IF;

  -- Idempotent: one verification per habit per day
  IF EXISTS (
    SELECT 1 FROM public.habit_verifications
    WHERE user_id = _uid AND habit_id = _habit_id AND completed_date = _completed_date
  ) THEN
    RETURN jsonb_build_object('already_verified', true, 'xp', 0, 'coins', 0);
  END IF;

  _coins_actual := public.award_coins(_uid, _coin_award, 'verification',
    jsonb_build_object('habit_id', _habit_id, 'date', _completed_date));

  SELECT COALESCE(xp, 0) INTO _current_xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  PERFORM public.update_profile_internal(_uid, jsonb_build_object('xp', _current_xp + _xp_award));

  INSERT INTO public.habit_verifications(user_id, habit_id, completed_date, question, response, xp_awarded, coins_awarded)
  VALUES (_uid, _habit_id, _completed_date, COALESCE(_question, ''), _response, _xp_award, _coins_actual);

  RETURN jsonb_build_object('already_verified', false, 'xp', _xp_award, 'coins', _coins_actual);
END;
$$;

-- ============================================================
-- submit_daily_reflection — +10 XP / +5 coins, once per day
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_daily_reflection(
  _prompt text,
  _response text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _xp_award int := 10;
  _coin_award int := 5;
  _coins_actual int := 0;
  _current_xp int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _response IS NULL OR length(trim(_response)) < 5 THEN
    RAISE EXCEPTION 'response_too_short';
  END IF;
  IF length(_response) > 2000 THEN
    RAISE EXCEPTION 'response_too_long';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_reflections
    WHERE user_id = _uid AND reflection_date = _today
  ) THEN
    RETURN jsonb_build_object('already_reflected', true, 'xp', 0, 'coins', 0);
  END IF;

  _coins_actual := public.award_coins(_uid, _coin_award, 'reflection',
    jsonb_build_object('date', _today));

  SELECT COALESCE(xp, 0) INTO _current_xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  PERFORM public.update_profile_internal(_uid, jsonb_build_object('xp', _current_xp + _xp_award));

  INSERT INTO public.daily_reflections(user_id, reflection_date, prompt, response, xp_awarded, coins_awarded)
  VALUES (_uid, _today, COALESCE(_prompt, ''), _response, _xp_award, _coins_actual);

  RETURN jsonb_build_object('already_reflected', false, 'xp', _xp_award, 'coins', _coins_actual);
END;
$$;

-- ============================================================
-- award_celebration — idempotent payout for one-time milestones
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_celebration(
  _kind text,
  _key text,
  _xp integer DEFAULT 0,
  _coins integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _coins_actual int := 0;
  _current_xp int;
  _xp_clamped int;
  _coins_clamped int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _kind IS NULL OR _key IS NULL OR length(_kind) = 0 OR length(_key) = 0 THEN
    RAISE EXCEPTION 'invalid_params';
  END IF;
  IF _kind NOT IN ('rank','streak','referral','leaderboard','challenge') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  _xp_clamped := GREATEST(0, LEAST(COALESCE(_xp, 0), 1000));
  _coins_clamped := GREATEST(0, LEAST(COALESCE(_coins, 0), 500));

  IF EXISTS (
    SELECT 1 FROM public.winston_celebrations
    WHERE user_id = _uid AND kind = _kind AND key = _key
  ) THEN
    RETURN jsonb_build_object('already_awarded', true, 'xp', 0, 'coins', 0);
  END IF;

  IF _coins_clamped > 0 THEN
    _coins_actual := public.award_coins(_uid, _coins_clamped, 'celebration',
      jsonb_build_object('kind', _kind, 'key', _key));
  END IF;

  IF _xp_clamped > 0 THEN
    SELECT COALESCE(xp, 0) INTO _current_xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
    PERFORM public.update_profile_internal(_uid, jsonb_build_object('xp', _current_xp + _xp_clamped));
  END IF;

  INSERT INTO public.winston_celebrations(user_id, kind, key, xp_awarded, coins_awarded)
  VALUES (_uid, _kind, _key, _xp_clamped, _coins_actual);

  RETURN jsonb_build_object('already_awarded', false, 'xp', _xp_clamped, 'coins', _coins_actual);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_habit_verification(uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_daily_reflection(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_celebration(text, text, integer, integer) TO authenticated;
