-- Reduce GraphQL/PostgREST discoverability of internal tables (lint 0027)
REVOKE SELECT ON public.premium_grants FROM authenticated, anon;
REVOKE SELECT ON public.xp_transactions FROM authenticated, anon;

-- Revoke EXECUTE on SECURITY DEFINER routines never invoked by clients (lint 0029)
REVOKE EXECUTE ON FUNCTION public.award_celebration(text, text, integer, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text) FROM authenticated, anon;