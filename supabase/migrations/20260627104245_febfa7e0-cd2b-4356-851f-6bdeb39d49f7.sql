
-- 1) Replace single global unique on referral_code with a partial unique on the owner row only,
--    plus one redemption per redeemed user.
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_referral_code_key;
DROP INDEX IF EXISTS public.referrals_referral_code_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS referrals_owner_code_unique_idx
  ON public.referrals (referral_code) WHERE referred_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_unique_idx
  ON public.referrals (referred_id) WHERE referred_id IS NOT NULL;

-- 2) Validate: code exists as an owner row (case-insensitive, trimmed).
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _norm text;
BEGIN
  IF _code IS NULL THEN RETURN false; END IF;
  _norm := upper(btrim(_code));
  IF _norm !~ '^[A-Z0-9]{6}$' THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referral_code = _norm AND referred_id IS NULL
  );
END;
$$;

-- 3) Drop legacy 1-arg redeem; rewrite 3-arg redeem to INSERT a new redemption row.
DROP FUNCTION IF EXISTS public.redeem_referral(text);

CREATE OR REPLACE FUNCTION public.redeem_referral(
  _code text,
  _fingerprint text DEFAULT NULL,
  _ip text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm text;
  _owner_id uuid;
  _referrer uuid;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _code IS NULL THEN
    RAISE EXCEPTION 'code_required' USING ERRCODE = 'P0001';
  END IF;

  _norm := upper(btrim(_code));
  IF _norm !~ '^[A-Z0-9]{6}$' THEN
    RAISE EXCEPTION 'code_invalid_format' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.rate_limit_check('redeem_referral_hour', 3600, 5);
  PERFORM public.rate_limit_check('redeem_referral_day', 86400, 20);

  -- Find the permanent owner row for this code
  SELECT id, referrer_id INTO _owner_id, _referrer
  FROM public.referrals
  WHERE referral_code = _norm AND referred_id IS NULL
  LIMIT 1;

  IF _owner_id IS NULL THEN
    RAISE EXCEPTION 'code_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF _referrer = _uid THEN
    RAISE EXCEPTION 'self_referral' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = _uid) THEN
    RAISE EXCEPTION 'already_redeemed' USING ERRCODE = 'P0001';
  END IF;

  -- Insert a fresh redemption row (does NOT consume the owner code).
  INSERT INTO public.referrals (
    referrer_id, referred_id, referral_code, redeemed_at,
    retention_eligible_at, device_fingerprint, signup_ip
  ) VALUES (
    _referrer, _uid, _norm, now(),
    now() + interval '30 days', _fingerprint, _ip
  )
  RETURNING id INTO _new_id;

  -- Pay the join XP bonus immediately on the new redemption row
  BEGIN
    PERFORM public.award_referral_join_xp(_new_id);
  EXCEPTION WHEN others THEN
    NULL;
  END;

  BEGIN
    PERFORM public.award_referral_signup_coins(_new_id);
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN _new_id;
END;
$$;
