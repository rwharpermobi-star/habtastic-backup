
CREATE OR REPLACE FUNCTION public.create_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing text;
  _code text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _i int;
  _tries int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Return existing open code WITHOUT consuming rate limit (read-only)
  SELECT referral_code INTO _existing
  FROM public.referrals
  WHERE referrer_id = _uid AND referred_id IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  -- Only rate-limit when we're about to actually create a new code
  PERFORM public.rate_limit_check('create_referral_code', 3600, 10);

  LOOP
    _tries := _tries + 1;
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.referrals(referrer_id, referral_code) VALUES (_uid, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _tries > 10 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$function$;
