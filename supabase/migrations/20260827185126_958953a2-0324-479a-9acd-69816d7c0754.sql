REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reward_referrer(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_check_ip(text, text, integer, integer) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.reward_referrer(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_check_ip(text, text, integer, integer) TO service_role;