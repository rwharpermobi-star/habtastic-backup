-- Applies the referral tables/functions from 20261021102000 that never reached the
-- live database (that file had an 'AS $$$' syntax error), WITHOUT its older
-- redeem_referral/create_referral_code (newer versions stay), then sets the new
-- paid-referral milestones 1/3/10/20.

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

-- =====================================================================
-- Paid-referral Premium milestones: 1 = 7 days, 3 = 30 days, 10 = 90 days,
-- 20 = lifetime Premium. Only referrals whose referred user made a verified
-- live paid purchase count (qualify_referral_payment, called by the payment
-- processors with the service role). Every milestone is granted at most once
-- per referrer (UNIQUE referrer_id, milestone) and lifetime is never removed.
-- =====================================================================

ALTER TABLE public.referral_reward_milestones
  ADD COLUMN IF NOT EXISTS lifetime boolean NOT NULL DEFAULT false;

DELETE FROM public.referral_reward_milestones WHERE milestone_count NOT IN (1, 3, 10, 20);
INSERT INTO public.referral_reward_milestones(milestone_count, premium_days, xp_bonus, points_bonus, enabled, lifetime, updated_at)
VALUES (1, 7, 0, 0, true, false, now()),
       (3, 30, 0, 0, true, false, now()),
       (10, 90, 0, 0, true, false, now()),
       (20, 0, 0, 0, true, true, now())
ON CONFLICT (milestone_count) DO UPDATE
  SET premium_days = EXCLUDED.premium_days,
      lifetime = EXCLUDED.lifetime,
      enabled = true,
      updated_at = now();

-- Lifetime Premium is stored separately so that subscription expiry, refunds or
-- RTDN revocations (which write is_premium / premium_until) can never downgrade it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifetime_premium boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_lifetime_premium()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Same caller check as protect_profile_fields: only the server (service role,
  -- or SECURITY DEFINER functions such as apply_referral_milestones) may change it.
  IF NOT (current_setting('role', true) = 'service_role'
          OR current_user IN ('supabase_admin', 'postgres', 'service_role')
          OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role') THEN
    NEW.lifetime_premium := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.lifetime_premium, false) ELSE false END;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.lifetime_premium, false) THEN
    NEW.lifetime_premium := true;  -- never downgraded
  END IF;
  IF COALESCE(NEW.lifetime_premium, false) THEN
    NEW.is_premium := true;
    NEW.premium_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_lifetime_premium ON public.profiles;
CREATE TRIGGER profiles_enforce_lifetime_premium
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lifetime_premium();


-- Grants every enabled milestone the referrer has reached and not yet received.
-- Idempotent: safe to call any number of times.
CREATE OR REPLACE FUNCTION public.apply_referral_milestones(_referrer_id uuid, _referral_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qualified integer;
  _m record;
  _current timestamptz;
  _is_lifetime boolean;
  _new_until timestamptz;
  _reward_id uuid;
  _rewards jsonb := '[]'::jsonb;
BEGIN
  IF _referrer_id IS NULL THEN RETURN _rewards; END IF;

  -- Serialise grants per referrer.
  PERFORM 1 FROM public.profiles WHERE user_id = _referrer_id FOR UPDATE;

  SELECT COUNT(*) INTO _qualified
  FROM public.referrals
  WHERE referrer_id = _referrer_id
    AND qualified_at IS NOT NULL
    AND referred_id IS NOT NULL
    AND referred_id <> _referrer_id
    AND admin_status IS DISTINCT FROM 'flagged';

  FOR _m IN
    SELECT milestone_count AS milestone, premium_days AS days, lifetime, xp_bonus, points_bonus
    FROM public.referral_reward_milestones
    WHERE enabled AND milestone_count <= _qualified
    ORDER BY milestone_count
  LOOP
    SELECT premium_until, COALESCE(lifetime_premium, false)
      INTO _current, _is_lifetime
    FROM public.profiles WHERE user_id = _referrer_id;

    _new_until := CASE WHEN _m.lifetime OR _m.days <= 0 THEN NULL
                       ELSE GREATEST(COALESCE(_current, now()), now()) + make_interval(days => _m.days) END;

    _reward_id := NULL;
    INSERT INTO public.referral_rewards
      (referrer_id, milestone, reward_kind, reward_days, qualified_count, premium_until_after)
    VALUES (_referrer_id, _m.milestone, CASE WHEN _m.lifetime THEN 'lifetime' ELSE 'days' END,
            CASE WHEN _m.lifetime THEN 0 ELSE _m.days END, _qualified,
            CASE WHEN _is_lifetime OR _m.lifetime THEN NULL ELSE _new_until END)
    ON CONFLICT (referrer_id, milestone) DO NOTHING
    RETURNING id INTO _reward_id;
    IF _reward_id IS NULL THEN CONTINUE; END IF;  -- already granted

    IF _m.lifetime THEN
      UPDATE public.profiles
      SET lifetime_premium = true, is_premium = true, premium_until = NULL, updated_at = now()
      WHERE user_id = _referrer_id;
    ELSIF NOT _is_lifetime AND _m.days > 0 THEN
      UPDATE public.profiles
      SET is_premium = true,
          premium_until = CASE
            WHEN is_premium AND premium_until IS NULL THEN NULL       -- open-ended paid access: keep
            WHEN premium_until IS NOT NULL AND premium_until > _new_until THEN premium_until
            ELSE _new_until END,
          updated_at = now()
      WHERE user_id = _referrer_id;
    END IF;

    IF _referral_id IS NOT NULL THEN
      UPDATE public.referrals SET rewarded = true, reward_days = _m.days WHERE id = _referral_id;
    END IF;

    IF _m.xp_bonus > 0 THEN
      PERFORM public.award_xp(_referrer_id, _m.xp_bonus, 'referral',
        jsonb_build_object('referral_id', _referral_id, 'milestone', _m.milestone));
    END IF;
    IF _m.points_bonus > 0 AND _referral_id IS NOT NULL THEN
      INSERT INTO public.referral_points_ledger(user_id, referral_id, milestone_count, points_delta, reason, metadata)
      VALUES (_referrer_id, _referral_id, _m.milestone, _m.points_bonus, 'milestone', jsonb_build_object('qualified_count', _qualified))
      ON CONFLICT (user_id, referral_id, milestone_count, reason) DO NOTHING;
    END IF;

    INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (
      _referrer_id, 'referral',
      CASE WHEN _m.lifetime THEN 'Lifetime Premium unlocked 🎁'
           WHEN _is_lifetime THEN 'Referral milestone reached 🎁'
           ELSE _m.days || ' Days Premium unlocked 🎁' END,
      'You reached ' || _m.milestone || ' paid referral' || CASE WHEN _m.milestone = 1 THEN '' ELSE 's' END || '.',
      jsonb_build_object('milestone', _m.milestone, 'days', _m.days, 'lifetime', _m.lifetime));

    _rewards := _rewards || jsonb_build_object('milestone', _m.milestone, 'days', _m.days, 'lifetime', _m.lifetime);
  END LOOP;

  RETURN _rewards;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_referral_milestones(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_milestones(uuid, uuid) TO service_role;

-- Payment qualification: unchanged checks (live payment only, no self-referral,
-- not flagged by fraud review, referred user's Premium must be active and must not
-- predate the referral), then milestones are applied once.
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
  _sub_active boolean;
  _earliest_paid timestamptz;
BEGIN
  IF _referred_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'missing_user'); END IF;
  IF COALESCE(_environment, 'live') <> 'live' THEN RETURN jsonb_build_object('ok', false, 'reason', 'non_live_payment'); END IF;

  SELECT * INTO r FROM public.referrals WHERE referred_id = _referred_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referral'); END IF;
  IF r.referrer_id = _referred_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'self_referral'); END IF;
  IF r.admin_status = 'flagged' THEN RETURN jsonb_build_object('ok', false, 'reason', 'flagged'); END IF;
  IF r.qualified_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_qualified'); END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _referred_id AND p.is_premium = true
      AND (p.premium_until IS NULL OR p.premium_until > now())
  ) INTO _sub_active;
  IF NOT _sub_active THEN RETURN jsonb_build_object('ok', false, 'reason', 'subscription_not_active'); END IF;

  SELECT MIN(created_at) INTO _earliest_paid FROM public.premium_grants WHERE user_id = _referred_id;
  IF _earliest_paid IS NOT NULL AND _earliest_paid < COALESCE(r.redeemed_at, r.created_at) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_predates_referral');
  END IF;

  UPDATE public.referrals
  SET purchase_completed = true, qualified_at = now(),
      qualifying_payment_reference = _reference, qualifying_provider = _provider
  WHERE id = r.id;

  SELECT COUNT(*) INTO _qualified FROM public.referrals
  WHERE referrer_id = r.referrer_id AND qualified_at IS NOT NULL AND admin_status IS DISTINCT FROM 'flagged';

  RETURN jsonb_build_object('ok', true, 'qualified_count', _qualified,
    'rewards', public.apply_referral_milestones(r.referrer_id, r.id));
END;
$$;
REVOKE ALL ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) TO service_role;

-- Referrers who already qualify under the new thresholds get each reached
-- milestone once. Milestones already recorded (same count) are not granted again.
DO $$
DECLARE _r uuid;
BEGIN
  FOR _r IN
    SELECT DISTINCT referrer_id FROM public.referrals
    WHERE qualified_at IS NOT NULL AND referrer_id IS NOT NULL
  LOOP
    PERFORM public.apply_referral_milestones(_r, NULL);
  END LOOP;
END;
$$;
