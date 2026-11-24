-- Allow the signup screen to validate referral codes before the user has an account.
-- The function returns only true/false and does not expose referral owners or table rows.
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;

-- Keep referral redemption restricted to signed-in users.
REVOKE ALL ON FUNCTION public.redeem_referral(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text, text, text) TO authenticated;

-- Keep code generation restricted to signed-in users.
REVOKE ALL ON FUNCTION public.create_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_referral_code() TO authenticated;