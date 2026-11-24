
REVOKE ALL ON FUNCTION public.redeem_referral(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_friend_challenge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_challenge(text) TO authenticated;
