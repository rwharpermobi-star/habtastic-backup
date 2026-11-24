-- Extend referrals with two-stage XP tracking
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS joined_xp_awarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_xp_awarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retention_eligible_at timestamptz;

-- Backfill retention_eligible_at for already-redeemed referrals
UPDATE public.referrals
SET retention_eligible_at = redeemed_at + interval '30 days'
WHERE redeemed_at IS NOT NULL AND retention_eligible_at IS NULL;

-- Helper: award join XP idempotently
CREATE OR REPLACE FUNCTION public.award_referral_join_xp(_referral_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer uuid;
  _already boolean;
  _current_xp int;
BEGIN
  SELECT referrer_id, joined_xp_awarded
    INTO _referrer, _already
  FROM public.referrals
  WHERE id = _referral_id
  FOR UPDATE;

  IF _referrer IS NULL OR _already THEN
    RETURN;
  END IF;

  SELECT xp INTO _current_xp FROM public.profiles WHERE user_id = _referrer;

  PERFORM public.update_profile_internal(
    _referrer,
    jsonb_build_object('xp', COALESCE(_current_xp, 0) + 100)
  );

  UPDATE public.referrals
  SET joined_xp_awarded = true
  WHERE id = _referral_id;
END;
$$;

-- Helper: award retention XP if referred user still subscribed
CREATE OR REPLACE FUNCTION public.award_referral_retention_xp(_referral_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer uuid;
  _referred uuid;
  _already boolean;
  _eligible timestamptz;
  _current_xp int;
  _has_sub boolean;
BEGIN
  SELECT referrer_id, referred_id, retention_xp_awarded, retention_eligible_at
    INTO _referrer, _referred, _already, _eligible
  FROM public.referrals
  WHERE id = _referral_id
  FOR UPDATE;

  IF _referrer IS NULL OR _already OR _referred IS NULL THEN
    RETURN false;
  END IF;

  IF _eligible IS NULL OR _eligible > now() THEN
    RETURN false;
  END IF;

  _has_sub := public.has_active_subscription(_referred, 'live')
              OR public.has_active_subscription(_referred, 'test');

  IF NOT _has_sub THEN
    RETURN false;
  END IF;

  SELECT xp INTO _current_xp FROM public.profiles WHERE user_id = _referrer;

  PERFORM public.update_profile_internal(
    _referrer,
    jsonb_build_object('xp', COALESCE(_current_xp, 0) + 400)
  );

  UPDATE public.referrals
  SET retention_xp_awarded = true
  WHERE id = _referral_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_referral_join_xp(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_referral_retention_xp(uuid) TO service_role;

-- Update redeem_referral to set retention_eligible_at and award join XP
CREATE OR REPLACE FUNCTION public.redeem_referral(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ref_id uuid;
  _referrer uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, referrer_id INTO _ref_id, _referrer
  FROM public.referrals
  WHERE referral_code = upper(_code)
    AND referred_id IS NULL
  LIMIT 1;

  IF _ref_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _referrer = _uid THEN
    RAISE EXCEPTION 'Cannot redeem your own referral';
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = _uid) THEN
    RAISE EXCEPTION 'Referral already redeemed';
  END IF;

  UPDATE public.referrals
  SET referred_id = _uid,
      redeemed_at = COALESCE(redeemed_at, now()),
      retention_eligible_at = COALESCE(retention_eligible_at, now() + interval '30 days')
  WHERE id = _ref_id AND referred_id IS NULL;

  -- Pay the join XP bonus immediately
  PERFORM public.award_referral_join_xp(_ref_id);

  RETURN _ref_id;
END;
$$;