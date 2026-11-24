-- =====================================================================
-- Reward-path hardening: every client-callable reward must be provable
-- from authoritative server state. Idempotent / forward-only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Durable claim-once ledger (user + action + source record)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_claims (
  user_id       uuid NOT NULL,
  action        text NOT NULL,
  source_key    text NOT NULL,
  xp_awarded    integer NOT NULL DEFAULT 0,
  coins_awarded integer NOT NULL DEFAULT 0,
  gems_awarded  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action, source_key)
);

-- No INSERT/UPDATE/DELETE grant for clients: the ledger is server-only.
REVOKE ALL ON public.reward_claims FROM anon, authenticated;
GRANT SELECT ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_claims_select_own" ON public.reward_claims;
CREATE POLICY "reward_claims_select_own" ON public.reward_claims
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. Eligibility tokens (earned by a qualifying event, consumed once)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_eligibility (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL,
  kind        text NOT NULL,
  source_key  text NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, source_key)
);
CREATE INDEX IF NOT EXISTS reward_eligibility_open_idx
  ON public.reward_eligibility (user_id, kind) WHERE consumed_at IS NULL;

REVOKE ALL ON public.reward_eligibility FROM anon, authenticated;
GRANT SELECT ON public.reward_eligibility TO authenticated;
GRANT ALL ON public.reward_eligibility TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.reward_eligibility_id_seq TO service_role;
ALTER TABLE public.reward_eligibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_eligibility_select_own" ON public.reward_eligibility;
CREATE POLICY "reward_eligibility_select_own" ON public.reward_eligibility
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Drop reward_rules rows that cannot be proven from client input.
--    Each keeps its own trusted server path:
--      referral            -> qualify_referral_payment / reward_referrer
--      habit_verification  -> submit_habit_verification
--      daily_reflection    -> submit_daily_reflection
--      gem_*               -> claim_level_rewards / challenge completion RPCs
-- ---------------------------------------------------------------------
DELETE FROM public.reward_rules
WHERE action IN ('referral','habit_verification','daily_reflection',
                 'gem_weekly_consistency','gem_challenge_complete','gem_level_up');

-- ---------------------------------------------------------------------
-- 4. Server-derived streak (longest run of consecutive days with >=1
--    habit completion). Unforgeable: reads habits.completions only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_best_habit_streak()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH days AS (
    SELECT DISTINCT d::date AS day
    FROM public.habits h, unnest(COALESCE(h.completions,'{}'::text[])) AS d
    WHERE h.user_id = auth.uid()
      AND d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ),
  grouped AS (
    SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM days
  )
  SELECT COALESCE(MAX(cnt),0)::int
  FROM (SELECT count(*) AS cnt FROM grouped GROUP BY grp) t;
$$;
REVOKE ALL ON FUNCTION public.my_best_habit_streak() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_best_habit_streak() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. claim_action_reward — per-action proof of an authoritative event.
--    _ref_key is NEVER treated as proof; it is metadata only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_action_reward(
  _action text, _ref_id uuid DEFAULT NULL, _ref_key text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _r public.reward_rules;
  _xp int := 0; _coins int := 0; _gems int := 0;
  _today text := ((now() AT TIME ZONE 'utc')::date)::text;
  _md jsonb;
  _habit record;
  _entry record;
  _base_xp int; _base_coins int;
  _source_key text;
  _fresh boolean;
  _done int; _total int; _need int;
  _milestone int; _streak int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _action IS NULL OR length(_action) > 64 THEN RAISE EXCEPTION 'invalid_action'; END IF;

  -- ---------------- habit complete / undo (state-verified) ----------------
  IF _action IN ('habit_complete','habit_undo') THEN
    IF _ref_id IS NULL THEN RAISE EXCEPTION 'habit_required'; END IF;
    SELECT id, difficulty, COALESCE(completions,'{}'::text[]) AS completions
      INTO _habit FROM public.habits WHERE id = _ref_id AND user_id = _uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'habit_not_found'; END IF;

    _base_xp    := CASE _habit.difficulty WHEN 'easy' THEN 5 WHEN 'hard' THEN 20 ELSE 10 END;
    _base_coins := CASE _habit.difficulty WHEN 'easy' THEN 3 WHEN 'hard' THEN 10 ELSE 5 END;
    _md := jsonb_build_object('habit_id', _ref_id::text, 'date', _today, 'source', 'claim_action_reward');

    IF _action = 'habit_complete' THEN
      IF NOT (_habit.completions @> ARRAY[_today]) THEN RAISE EXCEPTION 'habit_not_completed_today'; END IF;
      _xp    := public.award_xp(_uid, _base_xp, 'habit_complete', _md);
      _coins := public.award_coins(_uid, _base_coins, 'habit_complete', _md);
      -- Completing a habit is what earns the right to a surprise roll.
      INSERT INTO public.reward_eligibility(user_id, kind, source_key)
      VALUES (_uid, 'surprise_roll', _ref_id::text || ':' || _today)
      ON CONFLICT (user_id, kind, source_key) DO NOTHING;
    ELSE
      IF _habit.completions @> ARRAY[_today] THEN RAISE EXCEPTION 'habit_still_completed_today'; END IF;
      _xp := public.award_xp(_uid, -_base_xp, 'habit_undo', _md);
    END IF;
    RETURN jsonb_build_object('xp', _xp, 'coins', _coins, 'gems', 0);
  END IF;

  SELECT * INTO _r FROM public.reward_rules WHERE action = _action;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_action'; END IF;

  -- ---------------- per-action proof + claim-once source key ----------------
  IF _action IN ('journal_write','journal_voice','journal_ai_feedback') THEN
    IF _ref_id IS NULL THEN RAISE EXCEPTION 'entry_required'; END IF;
    SELECT id, is_voice, ai_feedback INTO _entry
      FROM public.journal_entries WHERE id = _ref_id AND user_id = _uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'entry_not_found'; END IF;
    IF _action = 'journal_voice'       AND COALESCE(_entry.is_voice,false) IS NOT TRUE  THEN RAISE EXCEPTION 'entry_not_voice'; END IF;
    IF _action = 'journal_write'       AND COALESCE(_entry.is_voice,false) IS NOT FALSE THEN RAISE EXCEPTION 'entry_not_written'; END IF;
    IF _action = 'journal_ai_feedback' AND COALESCE(_entry.ai_feedback,'') = ''         THEN RAISE EXCEPTION 'entry_has_no_ai_feedback'; END IF;
    _source_key := _ref_id::text;

  ELSIF _action = 'challenge_day' THEN
    -- Verified from real completions: >=3 habits done today (or all of them
    -- when the user tracks fewer than 3).
    SELECT count(*) INTO _total FROM public.habits WHERE user_id = _uid;
    IF _total = 0 THEN RAISE EXCEPTION 'challenge_not_achieved'; END IF;
    SELECT count(*) INTO _done FROM public.habits
      WHERE user_id = _uid AND COALESCE(completions,'{}'::text[]) @> ARRAY[_today];
    _need := LEAST(3, _total);
    IF _done < _need THEN RAISE EXCEPTION 'challenge_not_achieved'; END IF;
    _source_key := _today;

  ELSIF _action IN ('streak_7','streak_30','streak_100') THEN
    _milestone := split_part(_action, '_', 2)::int;
    _streak := public.my_best_habit_streak();
    IF _streak < _milestone THEN RAISE EXCEPTION 'streak_not_reached'; END IF;
    _source_key := _action;   -- once, ever

  ELSIF _action = 'daily_login' THEN
    _source_key := _today;    -- once per day, the authenticated call is the event

  ELSE
    RAISE EXCEPTION 'unknown_action';
  END IF;

  -- ---------------- claim-once gate ----------------
  INSERT INTO public.reward_claims(user_id, action, source_key)
  VALUES (_uid, _action, _source_key)
  ON CONFLICT (user_id, action, source_key) DO NOTHING;
  GET DIAGNOSTICS _fresh = ROW_COUNT;
  IF NOT _fresh THEN
    RETURN jsonb_build_object('xp', 0, 'coins', 0, 'gems', 0, 'already_claimed', true);
  END IF;

  _md := jsonb_build_object('source', 'claim_action_reward', 'claim', _source_key);
  IF _ref_id IS NOT NULL THEN _md := _md || jsonb_build_object('ref_id', _ref_id::text); END IF;
  IF _r.dedupe_daily THEN _md := _md || jsonb_build_object('date', _today); END IF;

  IF _r.xp    > 0 AND _r.xp_reason   IS NOT NULL THEN _xp    := public.award_xp(_uid, _r.xp, _r.xp_reason, _md); END IF;
  IF _r.coins > 0 AND _r.coin_reason IS NOT NULL THEN _coins := public.award_coins(_uid, _r.coins, _r.coin_reason, _md); END IF;
  IF _r.gems  > 0 THEN _gems := public.adjust_gems_internal(_uid, _r.gems, _action, _md); END IF;

  UPDATE public.reward_claims
     SET xp_awarded = _xp, coins_awarded = _coins, gems_awarded = _gems
   WHERE user_id = _uid AND action = _action AND source_key = _source_key;

  RETURN jsonb_build_object('xp', _xp, 'coins', _coins, 'gems', _gems);
END; $function$;

REVOKE ALL ON FUNCTION public.claim_action_reward(text,uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_action_reward(text,uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. roll_surprise_reward — consumes one earned eligibility.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roll_surprise_reward()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _elig bigint;
  _pick numeric;
  _type text; _amount int; _rarity text;
  _awarded int := 0;
  _held int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  -- Atomically claim one unconsumed eligibility. No eligibility => no roll,
  -- so a modified client cannot farm by calling this in a loop.
  UPDATE public.reward_eligibility
     SET consumed_at = now()
   WHERE id = (
     SELECT id FROM public.reward_eligibility
      WHERE user_id = _uid AND kind = 'surprise_roll' AND consumed_at IS NULL
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
  RETURNING id INTO _elig;

  IF _elig IS NULL THEN
    RETURN jsonb_build_object('reward', NULL, 'reason', 'not_eligible');
  END IF;

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
                  jsonb_build_object('rarity', _rarity, 'eligibility', _elig,
                                     'source', 'roll_surprise_reward'));
    IF _awarded <= 0 THEN RETURN jsonb_build_object('reward', NULL); END IF;
    _amount := _awarded;
  ELSE
    SELECT COALESCE(streak_freezes, 0) INTO _held FROM public.profiles WHERE user_id = _uid FOR UPDATE;
    IF _held IS NULL OR _held >= 3 THEN RETURN jsonb_build_object('reward', NULL); END IF;
    UPDATE public.profiles SET streak_freezes = _held + 1, updated_at = now() WHERE user_id = _uid;
  END IF;

  RETURN jsonb_build_object('reward',
    jsonb_build_object('type', _type, 'amount', _amount, 'rarity', _rarity));
END; $function$;

REVOKE ALL ON FUNCTION public.roll_surprise_reward() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.roll_surprise_reward() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Trial: server clock only, one-way NULL -> now().
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_my_trial()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE _uid uuid := auth.uid(); _started timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  -- now() is the ONLY value ever written; no caller input is accepted.
  UPDATE public.profiles
     SET trial_started_at = now(), updated_at = now()
   WHERE user_id = _uid AND trial_started_at IS NULL;
  SELECT trial_started_at INTO _started FROM public.profiles WHERE user_id = _uid;
  RETURN jsonb_build_object('trial_started_at', _started);
END; $function$;
REVOKE ALL ON FUNCTION public.start_my_trial() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_my_trial() TO authenticated, service_role;

-- Keep the old entrypoint working, but it may no longer carry a timestamp.
CREATE OR REPLACE FUNCTION public.update_my_profile_state(_updates jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE _uid uuid := auth.uid(); _u jsonb := COALESCE(_updates,'{}'::jsonb);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  -- The caller-supplied value is deliberately DISCARDED: presence of the key
  -- is only a request to start the trial now.
  IF _u ? 'trial_started_at' THEN
    PERFORM public.start_my_trial();
  END IF;
END; $function$;
REVOKE ALL ON FUNCTION public.update_my_profile_state(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile_state(jsonb) TO authenticated, service_role;

-- Repair any trial timestamp that was set in the future (self-granted premium).
UPDATE public.profiles SET trial_started_at = created_at, updated_at = now()
WHERE trial_started_at IS NOT NULL AND trial_started_at > now();

-- ---------------------------------------------------------------------
-- 8. Premium: the trial window is bounded on BOTH sides, so a future
--    timestamp can never read as an active trial.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_premium(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT COALESCE(
    (p.is_premium AND (p.premium_until IS NULL OR p.premium_until > now()))
    OR (p.trial_started_at IS NOT NULL
        AND p.trial_started_at <= now()
        AND p.trial_started_at > now() - interval '5 days'),
  false)
  FROM public.profiles p WHERE p.user_id = _user_id;
$function$;
REVOKE ALL ON FUNCTION public.user_is_premium(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_is_premium(uuid) TO authenticated, service_role;