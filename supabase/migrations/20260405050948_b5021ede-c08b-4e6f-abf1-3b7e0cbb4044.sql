
-- Add new columns to referrals table
ALTER TABLE public.referrals 
  ADD COLUMN IF NOT EXISTS purchase_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rewarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_days integer NOT NULL DEFAULT 0;

-- Function to reward referrer with premium days
CREATE OR REPLACE FUNCTION public.reward_referrer(_referral_id uuid, _days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _referrer_id uuid;
  _already_rewarded boolean;
  _current_premium_until timestamptz;
  _new_premium_until timestamptz;
BEGIN
  -- Get referral info
  SELECT referrer_id, rewarded INTO _referrer_id, _already_rewarded
  FROM public.referrals WHERE id = _referral_id;

  IF _referrer_id IS NULL THEN
    RAISE EXCEPTION 'Referral not found';
  END IF;

  IF _already_rewarded THEN
    RETURN; -- Already rewarded, skip
  END IF;

  -- Get current premium_until
  SELECT premium_until INTO _current_premium_until
  FROM public.profiles WHERE user_id = _referrer_id;

  -- Calculate new premium_until
  IF _current_premium_until IS NULL OR _current_premium_until < now() THEN
    _new_premium_until := now() + (_days || ' days')::interval;
  ELSE
    _new_premium_until := _current_premium_until + (_days || ' days')::interval;
  END IF;

  -- Update profile
  UPDATE public.profiles
  SET is_premium = true, premium_until = _new_premium_until, updated_at = now()
  WHERE user_id = _referrer_id;

  -- Mark referral as rewarded
  UPDATE public.referrals
  SET rewarded = true, reward_days = _days, redeemed_at = now()
  WHERE id = _referral_id;
END;
$$;
