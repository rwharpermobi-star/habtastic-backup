-- Prevent concurrent referral redemption from assigning multiple referrals to one account.
-- Preflight confirmed no existing duplicate referred_id values.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_redemption_per_user
  ON public.referrals (referred_id)
  WHERE referred_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.redeem_referral(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  matched_id uuid;
  referrer uuid;
  recent_count integer := 0;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauth');
  END IF;
  IF _code IS NULL OR length(trim(_code)) < 4 OR length(trim(_code)) > 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT id, referrer_id
    INTO matched_id, referrer
  FROM public.referrals
  WHERE upper(referral_code) = upper(trim(_code))
    AND referred_id IS NULL
  LIMIT 1;

  IF matched_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF referrer = me THEN
    INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
    VALUES (matched_id, referrer, me, 'self_attempt',
            100, jsonb_build_object('source', 'redeem_referral'));
    RETURN jsonb_build_object('ok', false, 'error', 'self');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = me) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
  END IF;

  BEGIN
    UPDATE public.referrals
    SET referred_id = me, redeemed_at = now()
    WHERE id = matched_id AND referred_id IS NULL;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed');
  END;

  SELECT count(*) INTO recent_count
  FROM public.referrals
  WHERE referrer_id = referrer
    AND referred_id IS NOT NULL
    AND redeemed_at > now() - interval '24 hours';

  IF recent_count > 3 THEN
    INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
    VALUES (matched_id, referrer, me, 'rapid_signup_burst', 40,
            jsonb_build_object('count_24h', recent_count));
  END IF;

  RETURN jsonb_build_object('ok', true, 'referral_id', matched_id);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text) TO authenticated, service_role;
