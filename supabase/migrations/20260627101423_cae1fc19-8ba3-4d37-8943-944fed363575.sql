
-- 1) Strict uniqueness (defensive; index likely already exists)
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referral_code_unique_idx
  ON public.referrals (referral_code);

-- 2) Strict 6-char A-Z/0-9 generator (ambiguous chars excluded)
CREATE OR REPLACE FUNCTION public.create_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      IF _tries > 25 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$function$;

-- 3) Strict 6-char validator
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE _exists boolean;
BEGIN
  IF _code IS NULL OR _code !~ '^[A-Z0-9]{6}$' THEN
    RETURN false;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referral_code = upper(_code) AND referred_id IS NULL
  ) INTO _exists;
  RETURN _exists;
END;
$function$;

-- 4) Internal helper to mint a code for an arbitrary user (used by trigger + backfill)
CREATE OR REPLACE FUNCTION public.ensure_referral_code_for(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _existing text;
  _code text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  _i int;
  _tries int := 0;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  SELECT referral_code INTO _existing
  FROM public.referrals
  WHERE referrer_id = _user_id AND referred_id IS NULL
  ORDER BY created_at ASC LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  LOOP
    _tries := _tries + 1;
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.referrals(referrer_id, referral_code) VALUES (_user_id, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _tries > 25 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_referral_code_for(uuid) FROM PUBLIC, anon, authenticated;

-- 5) Auto-assign a referral code on signup (extend handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
  _avatar text;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'preferred_username',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'Hero'
  );
  _avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.profiles (user_id, name, avatar_url, trial_started_at, coins)
  VALUES (NEW.id, _name, _avatar, now(), 100)
  ON CONFLICT (user_id) DO UPDATE
    SET name = CASE WHEN public.profiles.name IS NULL OR public.profiles.name = 'Hero'
                    THEN EXCLUDED.name ELSE public.profiles.name END,
        avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);

  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (NEW.id, 100, 'welcome', '{}'::jsonb, 100)
  ON CONFLICT DO NOTHING;

  -- Permanent unique 6-char referral code
  BEGIN
    PERFORM public.ensure_referral_code_for(NEW.id);
  EXCEPTION WHEN others THEN
    -- never block signup on referral mint
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- 6) Backfill: any existing profile without an open referral code gets one
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.referrals rf
      WHERE rf.referrer_id = p.user_id AND rf.referred_id IS NULL
    )
  LOOP
    BEGIN
      PERFORM public.ensure_referral_code_for(r.user_id);
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END $$;
