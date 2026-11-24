
-- ============================================================
-- Phase 1: Coin ledger
-- ============================================================
CREATE TABLE public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coin_tx_user_created ON public.coin_transactions(user_id, created_at DESC);
CREATE INDEX idx_coin_tx_user_reason_date ON public.coin_transactions(user_id, reason, created_at);

GRANT SELECT ON public.coin_transactions TO authenticated;
GRANT ALL ON public.coin_transactions TO service_role;

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own coin transactions"
  ON public.coin_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client inserts on coin_transactions"
  ON public.coin_transactions AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Block client updates on coin_transactions"
  ON public.coin_transactions AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block client deletes on coin_transactions"
  ON public.coin_transactions AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- ============================================================
-- Phase 2: Daily chests
-- ============================================================
CREATE TABLE public.daily_chests (
  user_id uuid NOT NULL,
  opened_on date NOT NULL,
  reward_type text NOT NULL,
  reward_value integer NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opened_on)
);

GRANT SELECT ON public.daily_chests TO authenticated;
GRANT ALL ON public.daily_chests TO service_role;

ALTER TABLE public.daily_chests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily chests"
  ON public.daily_chests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client writes on daily_chests"
  ON public.daily_chests AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "Block client updates on daily_chests"
  ON public.daily_chests AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block client deletes on daily_chests"
  ON public.daily_chests AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- ============================================================
-- award_coins — credits coins with per-reason daily caps and ledger row
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

  -- Per-reason daily caps (defense-in-depth). NULL = uncapped.
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

  -- One-time reasons: only one ledger row ever
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
-- spend_coins — atomic debit
-- ============================================================
CREATE OR REPLACE FUNCTION public.spend_coins(
  _user_id uuid,
  _amount integer,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current int;
  _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN false;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(coins, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF _current < _amount THEN
    RETURN false;
  END IF;

  _new_balance := _current - _amount;
  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('coins', _new_balance));

  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, -_amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spend_coins(uuid, integer, text, jsonb) TO authenticated;

-- ============================================================
-- open_daily_chest — verifies habits done, rolls weighted reward
-- ============================================================
CREATE OR REPLACE FUNCTION public.open_daily_chest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _today_str text := to_char(_today, 'YYYY-MM-DD');
  _dow int := EXTRACT(DOW FROM _today)::int;
  _due int;
  _done int;
  _roll numeric;
  _reward_type text;
  _reward_value int := 0;
  _premium_until timestamptz;
  _shields int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- One chest per day
  IF EXISTS (SELECT 1 FROM public.daily_chests WHERE user_id = _uid AND opened_on = _today) THEN
    RAISE EXCEPTION 'Chest already opened today';
  END IF;

  -- Count due habits today
  SELECT
    COUNT(*) FILTER (WHERE frequency <> 'custom' OR _dow = ANY(custom_days)),
    COUNT(*) FILTER (
      WHERE (frequency <> 'custom' OR _dow = ANY(custom_days))
        AND _today_str = ANY(completions)
    )
  INTO _due, _done
  FROM public.habits
  WHERE user_id = _uid;

  IF COALESCE(_due, 0) = 0 OR _done < _due THEN
    RAISE EXCEPTION 'Complete all of today''s habits to open the chest';
  END IF;

  _roll := random();

  IF _roll < 0.40 THEN
    _reward_type := 'coins'; _reward_value := 10;
  ELSIF _roll < 0.65 THEN
    _reward_type := 'coins'; _reward_value := 25;
  ELSIF _roll < 0.80 THEN
    _reward_type := 'coins'; _reward_value := 50;
  ELSIF _roll < 0.88 THEN
    _reward_type := 'coins'; _reward_value := 100;
  ELSIF _roll < 0.93 THEN
    _reward_type := 'streak_shield'; _reward_value := 1;
  ELSIF _roll < 0.97 THEN
    _reward_type := 'streak_saver'; _reward_value := 1;
  ELSIF _roll < 0.99 THEN
    _reward_type := 'double_xp_24h'; _reward_value := 24;
  ELSE
    _reward_type := 'premium_day_pass'; _reward_value := 1;
  END IF;

  INSERT INTO public.daily_chests(user_id, opened_on, reward_type, reward_value)
  VALUES (_uid, _today, _reward_type, _reward_value);

  IF _reward_type = 'coins' THEN
    PERFORM public.award_coins(_uid, _reward_value, 'daily_chest', jsonb_build_object('opened_on', _today));
  ELSIF _reward_type = 'streak_shield' THEN
    SELECT streak_freezes INTO _shields FROM public.profiles WHERE user_id = _uid;
    PERFORM public.update_profile_internal(_uid, jsonb_build_object('streak_freezes', COALESCE(_shields, 0) + _reward_value));
  ELSIF _reward_type = 'premium_day_pass' THEN
    SELECT premium_until INTO _premium_until FROM public.profiles WHERE user_id = _uid;
    IF _premium_until IS NULL OR _premium_until < now() THEN
      _premium_until := now() + interval '24 hours';
    ELSE
      _premium_until := _premium_until + interval '24 hours';
    END IF;
    PERFORM public.update_profile_internal(_uid, jsonb_build_object(
      'is_premium', true,
      'premium_until', to_char(_premium_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ));
  END IF;
  -- streak_saver and double_xp_24h are noted in daily_chests; their full systems land in later phases.

  RETURN jsonb_build_object('reward_type', _reward_type, 'reward_value', _reward_value);
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_daily_chest() TO authenticated;

-- ============================================================
-- Update handle_new_user to grant Welcome Coins
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _avatar text;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'preferred_username',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'Hero'
  );
  _avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.profiles (user_id, name, avatar_url, trial_started_at, coins)
  VALUES (NEW.id, _name, _avatar, now(), 100)
  ON CONFLICT (user_id) DO UPDATE
    SET name = CASE WHEN public.profiles.name IS NULL OR public.profiles.name = 'Hero'
                    THEN EXCLUDED.name ELSE public.profiles.name END,
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);

  -- Ledger row for welcome bonus (guarded by award_coins one-time check on subsequent calls)
  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (NEW.id, 100, 'welcome', '{}'::jsonb, 100)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Backfill: 100 Welcome Coins for existing profiles without a welcome row
-- ============================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.user_id, COALESCE(p.coins, 0) AS coins
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.coin_transactions ct
      WHERE ct.user_id = p.user_id AND ct.reason = 'welcome'
    )
  LOOP
    PERFORM public.update_profile_internal(r.user_id, jsonb_build_object('coins', r.coins + 100));
    INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
    VALUES (r.user_id, 100, 'welcome', '{"backfill": true}'::jsonb, r.coins + 100);
  END LOOP;
END $$;
