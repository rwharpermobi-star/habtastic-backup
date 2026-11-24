CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referral_code = upper(_code)
      AND referred_id IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;