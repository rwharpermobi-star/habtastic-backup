-- Limit referral-code validation to a boolean-like result.
-- Keep anon access for pre-signup validation, but do not expose referrer UUIDs.
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  normalized_code text := upper(btrim(COALESCE(_code, '')));
  is_valid boolean := false;
BEGIN
  IF length(normalized_code) < 4 OR length(normalized_code) > 32 THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.referrals r
    WHERE upper(btrim(r.referral_code)) = normalized_code
      AND r.referred_id IS NULL
      AND r.referrer_id IS NOT NULL
  ) INTO is_valid;

  RETURN jsonb_build_object('valid', is_valid);
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated, service_role;
