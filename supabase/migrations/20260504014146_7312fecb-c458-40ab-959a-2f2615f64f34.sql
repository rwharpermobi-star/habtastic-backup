
-- Referrals: remove open-claim policy, add SECURITY DEFINER RPC requiring the code
DROP POLICY IF EXISTS "Users can redeem referrals" ON public.referrals;

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

  -- Only allow each user to redeem one referral as the referred party
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = _uid) THEN
    RAISE EXCEPTION 'Referral already redeemed';
  END IF;

  UPDATE public.referrals
  SET referred_id = _uid
  WHERE id = _ref_id AND referred_id IS NULL;

  RETURN _ref_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text) TO authenticated;

-- Friend challenges: remove open-claim policy, add RPC requiring the code
DROP POLICY IF EXISTS "Users can accept challenges" ON public.friend_challenges;

CREATE OR REPLACE FUNCTION public.accept_friend_challenge(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ch_id uuid;
  _challenger uuid;
  _claimed uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, challenger_id, challenged_id
    INTO _ch_id, _challenger, _claimed
  FROM public.friend_challenges
  WHERE challenge_code = upper(_code)
  LIMIT 1;

  IF _ch_id IS NULL THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF _challenger = _uid THEN
    RAISE EXCEPTION 'Cannot accept your own challenge';
  END IF;

  IF _claimed IS NOT NULL THEN
    RAISE EXCEPTION 'Challenge already accepted';
  END IF;

  UPDATE public.friend_challenges
  SET challenged_id = _uid, status = 'accepted'
  WHERE id = _ch_id AND challenged_id IS NULL;

  RETURN _ch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_friend_challenge(text) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_friend_challenge(text) TO authenticated;
