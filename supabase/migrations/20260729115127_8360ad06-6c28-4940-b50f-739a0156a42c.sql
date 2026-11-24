
CREATE TABLE public.mood_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  habit_id uuid,
  mood text NOT NULL,
  intensity integer NOT NULL DEFAULT 3,
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.mood_logs TO authenticated;
GRANT ALL ON public.mood_logs TO service_role;
ALTER TABLE public.mood_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own mood logs" ON public.mood_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own mood logs" ON public.mood_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own mood logs" ON public.mood_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_mood_logs_user_date ON public.mood_logs(user_id, date DESC);

-- Coin ledger
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
CREATE POLICY "Users read own coin transactions" ON public.coin_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client inserts on coin_transactions" ON public.coin_transactions AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block client updates on coin_transactions" ON public.coin_transactions AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block client deletes on coin_transactions" ON public.coin_transactions AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Daily chests
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
CREATE POLICY "Users read own daily chests" ON public.daily_chests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client writes on daily_chests" ON public.daily_chests AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block client updates on daily_chests" ON public.daily_chests AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block client deletes on daily_chests" ON public.daily_chests AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Cosmetics
CREATE TABLE public.cosmetic_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  rarity text NOT NULL,
  price_coins integer,
  unlock_rule jsonb NOT NULL DEFAULT '{"type":"purchase"}'::jsonb,
  asset_url text,
  preview_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cosmetic_items TO anon, authenticated;
GRANT ALL ON public.cosmetic_items TO service_role;
ALTER TABLE public.cosmetic_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog public read" ON public.cosmetic_items FOR SELECT USING (is_active = true);

CREATE TABLE public.user_cosmetics (
  user_id uuid NOT NULL,
  item_id text NOT NULL REFERENCES public.cosmetic_items(id) ON DELETE CASCADE,
  acquired_via text NOT NULL DEFAULT 'purchase',
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
GRANT SELECT ON public.user_cosmetics TO authenticated;
GRANT ALL ON public.user_cosmetics TO service_role;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own cosmetics" ON public.user_cosmetics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client writes user_cosmetics" ON public.user_cosmetics AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.user_equipped_cosmetics (
  user_id uuid PRIMARY KEY,
  theme text,
  frame text,
  crown text,
  effect text,
  emote text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_equipped_cosmetics TO authenticated;
GRANT ALL ON public.user_equipped_cosmetics TO service_role;
ALTER TABLE public.user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own equipped" ON public.user_equipped_cosmetics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client writes equipped" ON public.user_equipped_cosmetics AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.leaderboard_crowns (
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  place integer NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_start)
);
GRANT SELECT ON public.leaderboard_crowns TO authenticated;
GRANT ALL ON public.leaderboard_crowns TO service_role;
ALTER TABLE public.leaderboard_crowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Crowns public read" ON public.leaderboard_crowns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Block client writes crowns" ON public.leaderboard_crowns AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Winston Coach verification/reflection/celebrations
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS verification_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_question text;

CREATE TABLE public.habit_verifications (
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
CREATE POLICY "Users read own verifications" ON public.habit_verifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client writes verifications" ON public.habit_verifications AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.daily_reflections (
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
CREATE POLICY "Users read own reflections" ON public.daily_reflections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client writes reflections" ON public.daily_reflections AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE public.winston_celebrations (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  key text NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, key)
);
GRANT SELECT ON public.winston_celebrations TO authenticated;
GRANT ALL ON public.winston_celebrations TO service_role;
ALTER TABLE public.winston_celebrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own celebrations" ON public.winston_celebrations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Block client writes celebrations" ON public.winston_celebrations AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_coins(
  _user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _current int; _today_total int; _cap int; _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN 0; END IF;
  _cap := CASE _reason
    WHEN 'welcome' THEN 100 WHEN 'daily_login' THEN 10 WHEN 'habit_complete' THEN 100
    WHEN 'all_habits_complete' THEN 50 WHEN 'streak_7' THEN 25 WHEN 'streak_30' THEN 50
    WHEN 'streak_100' THEN 100 WHEN 'challenge_complete' THEN 200 WHEN 'daily_chest' THEN 100
    WHEN 'referral_signup' THEN 1000 WHEN 'referral_milestone' THEN 10000
    WHEN 'verification' THEN 50 WHEN 'reflection' THEN 10 WHEN 'celebration' THEN 500
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
  _new_balance := _current + _amount;
  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('coins', _new_balance));
  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);
  RETURN _amount;
END; $$;

CREATE OR REPLACE FUNCTION public.spend_coins(
  _user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _current int; _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE(coins, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF _current < _amount THEN RETURN false; END IF;
  _new_balance := _current - _amount;
  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('coins', _new_balance));
  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, -_amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.spend_coins(uuid, integer, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_daily_chest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _today_str text := to_char(_today, 'YYYY-MM-DD');
  _dow int := EXTRACT(DOW FROM _today)::int;
  _due int; _done int; _roll numeric;
  _reward_type text; _reward_value int := 0;
  _premium_until timestamptz; _shields int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_chests WHERE user_id = _uid AND opened_on = _today) THEN
    RAISE EXCEPTION 'Chest already opened today'; END IF;
  SELECT
    COUNT(*) FILTER (WHERE frequency <> 'custom' OR _dow = ANY(custom_days)),
    COUNT(*) FILTER (WHERE (frequency <> 'custom' OR _dow = ANY(custom_days)) AND _today_str = ANY(completions))
  INTO _due, _done FROM public.habits WHERE user_id = _uid;
  IF COALESCE(_due, 0) = 0 OR _done < _due THEN RAISE EXCEPTION 'Complete all of today''s habits to open the chest'; END IF;
  _roll := random();
  IF _roll < 0.40 THEN _reward_type := 'coins'; _reward_value := 10;
  ELSIF _roll < 0.65 THEN _reward_type := 'coins'; _reward_value := 25;
  ELSIF _roll < 0.80 THEN _reward_type := 'coins'; _reward_value := 50;
  ELSIF _roll < 0.88 THEN _reward_type := 'coins'; _reward_value := 100;
  ELSIF _roll < 0.93 THEN _reward_type := 'streak_shield'; _reward_value := 1;
  ELSIF _roll < 0.97 THEN _reward_type := 'streak_saver'; _reward_value := 1;
  ELSIF _roll < 0.99 THEN _reward_type := 'double_xp_24h'; _reward_value := 24;
  ELSE _reward_type := 'premium_day_pass'; _reward_value := 1; END IF;
  INSERT INTO public.daily_chests(user_id, opened_on, reward_type, reward_value)
  VALUES (_uid, _today, _reward_type, _reward_value);
  IF _reward_type = 'coins' THEN
    PERFORM public.award_coins(_uid, _reward_value, 'daily_chest', jsonb_build_object('opened_on', _today));
  ELSIF _reward_type = 'streak_shield' THEN
    SELECT streak_freezes INTO _shields FROM public.profiles WHERE user_id = _uid;
    PERFORM public.update_profile_internal(_uid, jsonb_build_object('streak_freezes', COALESCE(_shields, 0) + _reward_value));
  ELSIF _reward_type = 'premium_day_pass' THEN
    SELECT premium_until INTO _premium_until FROM public.profiles WHERE user_id = _uid;
    IF _premium_until IS NULL OR _premium_until < now() THEN _premium_until := now() + interval '24 hours';
    ELSE _premium_until := _premium_until + interval '24 hours'; END IF;
    PERFORM public.update_profile_internal(_uid, jsonb_build_object(
      'is_premium', true,
      'premium_until', to_char(_premium_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  END IF;
  RETURN jsonb_build_object('reward_type', _reward_type, 'reward_value', _reward_value);
END; $$;
GRANT EXECUTE ON FUNCTION public.open_daily_chest() TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_cosmetic(_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _price int; _active boolean; _rule jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT price_coins, is_active, unlock_rule INTO _price, _active, _rule FROM public.cosmetic_items WHERE id = _item_id;
  IF _price IS NULL OR NOT _active OR (_rule->>'type') <> 'purchase' THEN RAISE EXCEPTION 'Item not purchasable'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = _uid AND item_id = _item_id) THEN
    RETURN jsonb_build_object('already_owned', true); END IF;
  IF NOT public.spend_coins(_uid, _price, 'cosmetic_purchase', jsonb_build_object('item_id', _item_id)) THEN
    RAISE EXCEPTION 'Insufficient coins'; END IF;
  INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via) VALUES (_uid, _item_id, 'purchase');
  RETURN jsonb_build_object('purchased', true, 'item_id', _item_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.purchase_cosmetic(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_cosmetic(_item_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _cat text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'Item not owned'; END IF;
  SELECT category INTO _cat FROM public.cosmetic_items WHERE id = _item_id;
  IF _cat NOT IN ('theme','frame','crown','effect','emote') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  INSERT INTO public.user_equipped_cosmetics(user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;
  EXECUTE format('UPDATE public.user_equipped_cosmetics SET %I = $1, updated_at = now() WHERE user_id = $2', _cat)
    USING _item_id, _uid;
END; $$;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unequip_cosmetic(_category text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category NOT IN ('theme','frame','crown','effect','emote') THEN RAISE EXCEPTION 'Invalid category'; END IF;
  EXECUTE format('UPDATE public.user_equipped_cosmetics SET %I = NULL, updated_at = now() WHERE user_id = $1', _category)
    USING _uid;
END; $$;
GRANT EXECUTE ON FUNCTION public.unequip_cosmetic(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_habit_verification(
  _habit_id uuid, _completed_date date, _question text, _response text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _owner uuid;
  _xp_award int := 25; _coin_award int := 5; _coins_actual int := 0; _current_xp int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _response IS NULL OR length(trim(_response)) < 3 THEN RAISE EXCEPTION 'response_too_short'; END IF;
  IF length(_response) > 2000 THEN RAISE EXCEPTION 'response_too_long'; END IF;
  SELECT user_id INTO _owner FROM public.habits WHERE id = _habit_id;
  IF _owner IS NULL OR _owner <> _uid THEN RAISE EXCEPTION 'habit_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.habit_verifications WHERE user_id = _uid AND habit_id = _habit_id AND completed_date = _completed_date) THEN
    RETURN jsonb_build_object('already_verified', true, 'xp', 0, 'coins', 0); END IF;
  _coins_actual := public.award_coins(_uid, _coin_award, 'verification', jsonb_build_object('habit_id', _habit_id, 'date', _completed_date));
  SELECT COALESCE(xp, 0) INTO _current_xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  PERFORM public.update_profile_internal(_uid, jsonb_build_object('xp', _current_xp + _xp_award));
  INSERT INTO public.habit_verifications(user_id, habit_id, completed_date, question, response, xp_awarded, coins_awarded)
  VALUES (_uid, _habit_id, _completed_date, COALESCE(_question, ''), _response, _xp_award, _coins_actual);
  RETURN jsonb_build_object('already_verified', false, 'xp', _xp_award, 'coins', _coins_actual);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_habit_verification(uuid, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_daily_reflection(_prompt text, _response text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _today date := (now() AT TIME ZONE 'UTC')::date;
  _xp_award int := 10; _coin_award int := 5; _coins_actual int := 0; _current_xp int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _response IS NULL OR length(trim(_response)) < 5 THEN RAISE EXCEPTION 'response_too_short'; END IF;
  IF length(_response) > 2000 THEN RAISE EXCEPTION 'response_too_long'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_reflections WHERE user_id = _uid AND reflection_date = _today) THEN
    RETURN jsonb_build_object('already_reflected', true, 'xp', 0, 'coins', 0); END IF;
  _coins_actual := public.award_coins(_uid, _coin_award, 'reflection', jsonb_build_object('date', _today));
  SELECT COALESCE(xp, 0) INTO _current_xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  PERFORM public.update_profile_internal(_uid, jsonb_build_object('xp', _current_xp + _xp_award));
  INSERT INTO public.daily_reflections(user_id, reflection_date, prompt, response, xp_awarded, coins_awarded)
  VALUES (_uid, _today, COALESCE(_prompt, ''), _response, _xp_award, _coins_actual);
  RETURN jsonb_build_object('already_reflected', false, 'xp', _xp_award, 'coins', _coins_actual);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_daily_reflection(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_celebration(_kind text, _key text, _xp integer DEFAULT 0, _coins integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _coins_actual int := 0; _current_xp int;
  _xp_clamped int; _coins_clamped int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _kind IS NULL OR _key IS NULL OR length(_kind) = 0 OR length(_key) = 0 THEN RAISE EXCEPTION 'invalid_params'; END IF;
  IF _kind NOT IN ('rank','streak','referral','leaderboard','challenge') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  _xp_clamped := GREATEST(0, LEAST(COALESCE(_xp, 0), 1000));
  _coins_clamped := GREATEST(0, LEAST(COALESCE(_coins, 0), 500));
  IF EXISTS (SELECT 1 FROM public.winston_celebrations WHERE user_id = _uid AND kind = _kind AND key = _key) THEN
    RETURN jsonb_build_object('already_awarded', true, 'xp', 0, 'coins', 0); END IF;
  IF _coins_clamped > 0 THEN
    _coins_actual := public.award_coins(_uid, _coins_clamped, 'celebration', jsonb_build_object('kind', _kind, 'key', _key));
  END IF;
  IF _xp_clamped > 0 THEN
    SELECT COALESCE(xp, 0) INTO _current_xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
    PERFORM public.update_profile_internal(_uid, jsonb_build_object('xp', _current_xp + _xp_clamped));
  END IF;
  INSERT INTO public.winston_celebrations(user_id, kind, key, xp_awarded, coins_awarded)
  VALUES (_uid, _kind, _key, _xp_clamped, _coins_actual);
  RETURN jsonb_build_object('already_awarded', false, 'xp', _xp_clamped, 'coins', _coins_actual);
END; $$;
GRANT EXECUTE ON FUNCTION public.award_celebration(text, text, integer, integer) TO authenticated;

-- Update handle_new_user to grant Welcome Coins
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1), 'Hero'))
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.award_coins(NEW.id, 100, 'welcome', '{}'::jsonb);
  RETURN NEW;
END; $$;
