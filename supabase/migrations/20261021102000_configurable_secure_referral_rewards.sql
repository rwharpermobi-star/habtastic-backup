-- Configurable referral rewards and signup-only referral redemption.
-- Existing referral codes, referral relationships, XP balances and Premium data are preserved.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS signup_ip text,
  ADD COLUMN IF NOT EXISTS joined_xp_awarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_xp_awarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_eligible_at timestamptz;

CREATE TABLE IF NOT EXISTS public.referral_reward_program (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  new_user_claim_window_hours integer NOT NULL DEFAULT 24 CHECK (new_user_claim_window_hours BETWEEN 1 AND 168),
  signup_xp_bonus integer NOT NULL DEFAULT 0 CHECK (signup_xp_bonus >= 0),
  signup_points_bonus integer NOT NULL DEFAULT 0 CHECK (signup_points_bonus >= 0),
  retention_xp_bonus integer NOT NULL DEFAULT 0 CHECK (retention_xp_bonus >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.referral_reward_program(id, new_user_claim_window_hours, retention_xp_bonus)
VALUES (true, 24, 0) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.referral_reward_program
  ADD COLUMN IF NOT EXISTS signup_xp_bonus integer NOT NULL DEFAULT 0 CHECK (signup_xp_bonus >= 0),
  ADD COLUMN IF NOT EXISTS signup_points_bonus integer NOT NULL DEFAULT 0 CHECK (signup_points_bonus >= 0),
  ADD COLUMN IF NOT EXISTS retention_xp_bonus integer NOT NULL DEFAULT 0 CHECK (retention_xp_bonus >= 0);

CREATE TABLE IF NOT EXISTS public.referral_reward_milestones (
  milestone_count integer PRIMARY KEY CHECK (milestone_count > 0),
  premium_days integer NOT NULL DEFAULT 0 CHECK (premium_days >= 0),
  xp_bonus integer NOT NULL DEFAULT 0 CHECK (xp_bonus >= 0),
  points_bonus integer NOT NULL DEFAULT 0 CHECK (points_bonus >= 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- These Premium milestones already exist in the current program. XP and points
-- remain zero until the owner approves values; no new amounts are activated.
INSERT INTO public.referral_reward_milestones(milestone_count, premium_days, xp_bonus, points_bonus, enabled)
VALUES (10, 7, 0, 0, true), (25, 14, 0, 0, true), (50, 30, 0, 0, true)
ON CONFLICT (milestone_count) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.referral_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  milestone_count integer NOT NULL,
  points_delta integer NOT NULL CHECK (points_delta > 0),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, referral_id, milestone_count, reason)
);
ALTER TABLE public.referral_reward_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reward_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_points_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_reward_program, public.referral_reward_milestones, public.referral_points_ledger FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.referral_reward_program TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_reward_milestones TO authenticated;
GRANT SELECT ON public.referral_points_ledger TO authenticated;
GRANT ALL ON public.referral_reward_program, public.referral_reward_milestones, public.referral_points_ledger TO service_role;

DROP POLICY IF EXISTS referral_reward_milestones_read_enabled ON public.referral_reward_milestones;
CREATE POLICY referral_reward_milestones_read_enabled ON public.referral_reward_milestones
  FOR SELECT TO authenticated USING (enabled);
DROP POLICY IF EXISTS referral_points_ledger_read_own ON public.referral_points_ledger;
CREATE POLICY referral_points_ledger_read_own ON public.referral_points_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS referral_reward_program_admin_read ON public.referral_reward_program;
DROP POLICY IF EXISTS referral_reward_program_read_config ON public.referral_reward_program;
CREATE POLICY referral_reward_program_read_config ON public.referral_reward_program
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS referral_reward_program_admin_update ON public.referral_reward_program;
CREATE POLICY referral_reward_program_admin_update ON public.referral_reward_program
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS referral_reward_milestones_admin_all ON public.referral_reward_milestones;
CREATE POLICY referral_reward_milestones_admin_all ON public.referral_reward_milestones
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Keep the permanent owner code row untouched. A redemption creates a separate
-- referral row and is only permitted shortly after account creation.
DROP FUNCTION IF EXISTS public.redeem_referral(text);
CREATE OR REPLACE FUNCTION public.redeem_referral(
  _code text,
  _fingerprint text DEFAULT NULL,
  _ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm text := upper(btrim(coalesce(_code, '')));
  _owner_id uuid;
  _referrer uuid;
  _created_at timestamptz;
  _window_hours integer := 24;
  _retention_xp_bonus integer := 0;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;
  IF _norm !~ '^[A-Z0-9]{6}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;

  SELECT created_at INTO _created_at FROM auth.users WHERE id = _uid;
  SELECT new_user_claim_window_hours, retention_xp_bonus
    INTO _window_hours, _retention_xp_bonus
  FROM public.referral_reward_program WHERE id = true;
  IF _created_at IS NULL OR _created_at < now() - make_interval(hours => COALESCE(_window_hours, 24)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'new_users_only');
  END IF;

  PERFORM public.rate_limit_check('redeem_referral_hour', 3600, 5);
  PERFORM public.rate_limit_check('redeem_referral_day', 86400, 20);

  SELECT id, referrer_id INTO _owner_id, _referrer
  FROM public.referrals
  WHERE referral_code = _norm AND referred_id IS NULL
  LIMIT 1;
  IF _owner_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;
  IF _referrer = _uid THEN RETURN jsonb_build_object('ok', false, 'error', 'self_referral'); END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = _uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
  END IF;

  -- Reused device fingerprints are rejected rather than paying out duplicate accounts.
  IF NULLIF(btrim(_fingerprint), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referred_id IS NOT NULL
      AND device_fingerprint = _fingerprint
      AND referred_id <> _uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_device');
  END IF;

  INSERT INTO public.referrals (
    referrer_id, referred_id, referral_code, redeemed_at, device_fingerprint, signup_ip, retention_eligible_at
  ) VALUES (
    _referrer, _uid, _norm, now(), NULLIF(btrim(_fingerprint), ''), NULLIF(btrim(_ip), ''),
    CASE WHEN COALESCE(_retention_xp_bonus, 0) > 0 THEN now() + interval '30 days' ELSE NULL END
  )
  RETURNING id INTO _new_id;

  RETURN jsonb_build_object('ok', true, 'referral_id', _new_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text, text, text) TO authenticated;

-- Keep all existing owner codes stable where possible. If a legacy redemption
-- consumed an owner's code row, restore that same code to the owner instead of
-- unnecessarily rotating it. New codes use cryptographically secure randomness.
CREATE OR REPLACE FUNCTION public.create_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _attempt integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  SELECT referral_code INTO _code
  FROM public.referrals
  WHERE referrer_id = _uid AND referred_id IS NULL
  ORDER BY created_at
  LIMIT 1;
  IF _code IS NOT NULL THEN RETURN _code; END IF;

  SELECT referral_code INTO _code
  FROM public.referrals
  WHERE referrer_id = _uid
  ORDER BY created_at
  LIMIT 1;

  IF _code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referral_code = _code AND referred_id IS NULL
  ) THEN
    BEGIN
      INSERT INTO public.referrals(referrer_id, referral_code) VALUES (_uid, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;

  PERFORM public.rate_limit_check('create_referral_code', 3600, 10);
  LOOP
    _attempt := _attempt + 1;
    _code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6));
    BEGIN
      INSERT INTO public.referrals(referrer_id, referral_code) VALUES (_uid, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _attempt >= 10 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_referral_code() TO authenticated;

-- Signup bonuses are configurable but default to zero. A service-role edge
-- function invokes this only after the newly registered user successfully redeems
-- a code, preventing the client from awarding XP or points directly.
CREATE OR REPLACE FUNCTION public.award_referral_signup_rewards(
  _referral_id uuid,
  _referred_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referral public.referrals;
  _xp_bonus integer := 0;
  _points_bonus integer := 0;
  _xp_awarded integer := 0;
  _xp_already_exists boolean := false;
  _points_awarded boolean := false;
  _points_inserted integer := 0;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT signup_xp_bonus, signup_points_bonus
    INTO _xp_bonus, _points_bonus
  FROM public.referral_reward_program WHERE id = true;
  IF COALESCE(_xp_bonus, 0) <= 0 AND COALESCE(_points_bonus, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'disabled', true);
  END IF;

  SELECT * INTO _referral
  FROM public.referrals
  WHERE id = _referral_id AND referred_id = _referred_id
  FOR UPDATE;
  IF NOT FOUND OR _referral.referrer_id = _referred_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'referral_not_found');
  END IF;
  IF _referral.joined_xp_awarded THEN
    RETURN jsonb_build_object('ok', true, 'already_awarded', true);
  END IF;

  IF _xp_bonus > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM public.xp_transactions x
      WHERE x.user_id = _referral.referrer_id
        AND x.reason = 'referral'
        AND x.metadata @> jsonb_build_object('referral_id', _referral.id, 'signup', true)
    ) INTO _xp_already_exists;
    IF NOT _xp_already_exists THEN
      _xp_awarded := public.award_xp(
        _referral.referrer_id,
        _xp_bonus,
        'referral',
        jsonb_build_object('referral_id', _referral.id, 'signup', true)
      );
      _xp_already_exists := _xp_awarded > 0;
    END IF;
  END IF;

  IF _points_bonus > 0 AND (COALESCE(_xp_bonus, 0) <= 0 OR _xp_already_exists OR _xp_awarded > 0) THEN
    INSERT INTO public.referral_points_ledger(user_id, referral_id, milestone_count, points_delta, reason, metadata)
    VALUES (_referral.referrer_id, _referral.id, 0, _points_bonus, 'signup', '{}'::jsonb)
    ON CONFLICT (user_id, referral_id, milestone_count, reason) DO NOTHING;
    GET DIAGNOSTICS _points_inserted = ROW_COUNT;
    _points_awarded := _points_inserted > 0;
    IF NOT _points_awarded THEN
      SELECT EXISTS (
        SELECT 1 FROM public.referral_points_ledger
        WHERE user_id = _referral.referrer_id AND referral_id = _referral.id
          AND milestone_count = 0 AND reason = 'signup'
      ) INTO _points_awarded;
    END IF;
  END IF;

  IF _xp_already_exists OR _points_awarded THEN
    UPDATE public.referrals SET joined_xp_awarded = true WHERE id = _referral.id;
    INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (_referral.referrer_id, 'referral', 'New referral reward',
      'A new-user referral reward was verified and credited.',
      jsonb_build_object('referral_id', _referral.id, 'xp', _xp_awarded, 'points', CASE WHEN _points_awarded THEN _points_bonus ELSE 0 END));
    RETURN jsonb_build_object('ok', true, 'xp', _xp_awarded, 'points', CASE WHEN _points_awarded THEN _points_bonus ELSE 0 END);
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'reward_not_awarded');
END;
$$;

REVOKE ALL ON FUNCTION public.award_referral_signup_rewards(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_referral_signup_rewards(uuid, uuid) TO service_role;

-- Optional 30-day retention XP is disabled by default. If approved through
-- referral_reward_program.retention_xp_bonus, it is paid only by a service-role job
-- after the referred account remains on verified active Premium for 30 days.
CREATE OR REPLACE FUNCTION public.award_referral_retention_xp(_referral_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referral public.referrals;
  _bonus integer := 0;
  _already_exists boolean := false;
  _awarded integer := 0;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT retention_xp_bonus INTO _bonus
  FROM public.referral_reward_program WHERE id = true;
  IF COALESCE(_bonus, 0) <= 0 THEN RETURN false; END IF;

  SELECT * INTO _referral FROM public.referrals
  WHERE id = _referral_id FOR UPDATE;
  IF NOT FOUND OR _referral.referred_id IS NULL
     OR NOT _referral.purchase_completed
     OR _referral.retention_xp_awarded
     OR _referral.retention_eligible_at IS NULL
     OR _referral.retention_eligible_at > now() THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _referral.referred_id
      AND p.is_premium = true
      AND (p.premium_until IS NULL OR p.premium_until > now())
  ) INTO _already_exists;
  IF NOT _already_exists THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.xp_transactions x
    WHERE x.user_id = _referral.referrer_id
      AND x.reason = 'referral'
      AND x.metadata @> jsonb_build_object('referral_id', _referral.id, 'retention', true)
  ) INTO _already_exists;
  IF _already_exists THEN
    UPDATE public.referrals SET retention_xp_awarded = true WHERE id = _referral.id;
    RETURN true;
  END IF;

  _awarded := public.award_xp(
    _referral.referrer_id,
    _bonus,
    'referral',
    jsonb_build_object('referral_id', _referral.id, 'retention', true)
  );
  IF _awarded > 0 THEN
    UPDATE public.referrals SET retention_xp_awarded = true WHERE id = _referral.id;
    INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (_referral.referrer_id, 'referral', 'Referral XP earned',
      'Your referred user completed the configured Premium retention period.',
      jsonb_build_object('referral_id', _referral.id, 'xp', _awarded));
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.award_referral_retention_xp(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_referral_retention_xp(uuid) TO service_role;

-- Payment qualification stays server-verified. Milestone values now come from
-- referral_reward_milestones instead of being hardcoded in this function.
CREATE OR REPLACE FUNCTION public.qualify_referral_payment(
  _referred_id uuid,
  _reference text,
  _provider text DEFAULT 'paystack',
  _environment text DEFAULT 'live'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.referrals;
  _qualified integer;
  _m record;
  _current timestamptz;
  _new_until timestamptz;
  _earliest_paid timestamptz;
  _rewards jsonb := '[]'::jsonb;
  _sub_active boolean;
  _already_indefinite boolean;
  _reward_id uuid;
BEGIN
  IF _referred_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_user'); END IF;
  IF COALESCE(_environment, 'live') <> 'live' THEN RETURN jsonb_build_object('ok', false, 'reason', 'non_live_payment'); END IF;

  SELECT * INTO r FROM public.referrals WHERE referred_id = _referred_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;
  IF r.referrer_id = _referred_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_referral'); END IF;
  IF r.qualified_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_qualified'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _referred_id
      AND p.is_premium = true
      AND (p.premium_until IS NULL OR p.premium_until > now())
  ) INTO _sub_active;
  IF NOT _sub_active THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription_not_active'); END IF;

  SELECT MIN(created_at) INTO _earliest_paid
  FROM public.premium_grants WHERE user_id = _referred_id;
  IF _earliest_paid IS NOT NULL AND _earliest_paid < COALESCE(r.redeemed_at, r.created_at) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_predates_referral');
  END IF;

  UPDATE public.referrals
  SET purchase_completed = true, qualified_at = now(),
      qualifying_payment_reference = _reference, qualifying_provider = _provider
  WHERE id = r.id;

  SELECT COUNT(*) INTO _qualified
  FROM public.referrals
  WHERE referrer_id = r.referrer_id AND qualified_at IS NOT NULL;

  FOR _m IN
    SELECT milestone_count AS milestone, premium_days AS days,
           xp_bonus, points_bonus
    FROM public.referral_reward_milestones
    WHERE enabled AND milestone_count <= _qualified
    ORDER BY milestone_count
  LOOP
    SELECT premium_until, (is_premium AND premium_until IS NULL)
      INTO _current, _already_indefinite
    FROM public.profiles WHERE user_id = r.referrer_id FOR UPDATE;
    _new_until := GREATEST(COALESCE(_current, now()), now()) + (_m.days || ' days')::interval;

    INSERT INTO public.referral_rewards
      (referrer_id, milestone, reward_kind, reward_days, qualified_count, premium_until_after)
    VALUES (r.referrer_id, _m.milestone, 'days', _m.days, _qualified, CASE WHEN _already_indefinite THEN NULL ELSE _new_until END)
    ON CONFLICT (referrer_id, milestone) DO NOTHING
    RETURNING id INTO _reward_id;
    IF _reward_id IS NULL THEN CONTINUE; END IF;

    IF NOT COALESCE(_already_indefinite, false) THEN
      UPDATE public.profiles
      SET is_premium = CASE WHEN _m.days > 0 THEN true ELSE is_premium END,
          premium_until = CASE
            WHEN _m.days <= 0 THEN premium_until
            WHEN premium_until IS NOT NULL AND premium_until > _new_until THEN premium_until
            ELSE _new_until
          END,
          updated_at = now()
      WHERE user_id = r.referrer_id;
    END IF;

    UPDATE public.referrals SET rewarded = true, reward_days = _m.days WHERE id = r.id;

    IF _m.xp_bonus > 0 THEN
      PERFORM public.award_xp(
        r.referrer_id, _m.xp_bonus, 'referral',
        jsonb_build_object('referral_id', r.id, 'milestone', _m.milestone)
      );
    END IF;

    IF _m.points_bonus > 0 THEN
      INSERT INTO public.referral_points_ledger(user_id, referral_id, milestone_count, points_delta, reason, metadata)
      VALUES (r.referrer_id, r.id, _m.milestone, _m.points_bonus, 'milestone', jsonb_build_object('qualified_count', _qualified))
      ON CONFLICT (user_id, referral_id, milestone_count, reason) DO NOTHING;
    END IF;

    INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (
      r.referrer_id,
      'referral',
      CASE WHEN _m.days > 0 AND NOT COALESCE(_already_indefinite, false) THEN _m.days || ' Days Premium unlocked 🎁' ELSE 'Referral milestone reached 🎁' END,
      CASE WHEN _already_indefinite THEN 'You reached ' || _m.milestone || ' qualified paid referrals. Your current Premium access remains unchanged.' ELSE 'You reached ' || _m.milestone || ' qualified paid referrals.' END,
      jsonb_build_object('milestone', _m.milestone, 'days', _m.days, 'xp', _m.xp_bonus, 'points', _m.points_bonus)
    );

    _rewards := _rewards || jsonb_build_object('milestone', _m.milestone, 'days', _m.days, 'xp', _m.xp_bonus, 'points', _m.points_bonus);
    _reward_id := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'qualified_count', _qualified, 'rewards', _rewards);
END;
$$;

REVOKE ALL ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) TO service_role;
