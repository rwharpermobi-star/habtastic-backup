-- Claim an AdMob rewarded-ad grant atomically.  The previous Edge Function
-- read the daily count and cooldown before calling award_coins(), allowing
-- concurrent requests to pass the same checks and mint multiple rewards.
CREATE OR REPLACE FUNCTION public.claim_rewarded_ad_reward(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _coins_per_ad constant integer := 20;
  _daily_cap constant integer := 5;
  _cooldown interval := interval '120 seconds';
  _today_start timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  _is_premium boolean;
  _premium_until timestamptz;
  _balance integer;
  _grants_today integer;
  _last_grant timestamptz;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  -- The profile row is the per-user mutex for the entire check-and-award path.
  SELECT is_premium, premium_until, coins
    INTO _is_premium, _premium_until, _balance
  FROM public.profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'profile_missing', 'remaining', 0);
  END IF;

  IF _is_premium AND (_premium_until IS NULL OR _premium_until > now()) THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'premium', 'remaining', 0);
  END IF;

  SELECT count(*)::integer, max(created_at)
    INTO _grants_today, _last_grant
  FROM public.coin_transactions
  WHERE user_id = _user_id
    AND reason = 'rewarded_ad'
    AND created_at >= _today_start;

  IF _grants_today >= _daily_cap THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'daily_cap', 'remaining', 0);
  END IF;

  IF _last_grant IS NOT NULL AND now() - _last_grant < _cooldown THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'cooldown',
      'remaining', _daily_cap - _grants_today
    );
  END IF;

  UPDATE public.profiles
  SET coins = coins + _coins_per_ad,
      updated_at = now()
  WHERE user_id = _user_id
  RETURNING coins INTO _balance;

  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (
    _user_id,
    _coins_per_ad,
    'rewarded_ad',
    jsonb_build_object('source', 'admob_rewarded'),
    _balance
  );

  RETURN jsonb_build_object(
    'granted', true,
    'coins', _coins_per_ad,
    'balance', _balance,
    'remaining', _daily_cap - _grants_today - 1
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_rewarded_ad_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_ad_reward(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_rewarded_ad_reward(uuid) IS
  'Atomically applies the rewarded-ad cooldown, daily cap, premium check and coin grant.';
