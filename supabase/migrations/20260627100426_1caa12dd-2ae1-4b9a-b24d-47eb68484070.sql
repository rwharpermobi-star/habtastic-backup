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
  -- 6-char mix: uppercase letters, digits, and URL-safe symbols (- and _).
  -- Excludes ambiguous chars (I, O, 0, 1) for readability.
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789-_';
  _i int;
  _tries int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT referral_code INTO _existing
  FROM public.referrals
  WHERE referrer_id = _uid AND referred_id IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

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

-- Allow the same mixed alphabet in validation
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE _exists boolean;
BEGIN
  IF _code IS NULL OR length(_code) < 4 OR length(_code) > 16 THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referral_code = upper(_code) AND referred_id IS NULL
  ) INTO _exists;
  RETURN _exists;
END;
$function$;