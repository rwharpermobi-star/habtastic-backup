
-- 1. referral_milestone_payouts
CREATE TABLE public.referral_milestone_payouts (
  user_id uuid NOT NULL,
  milestone_count int NOT NULL,
  coins_awarded int NOT NULL DEFAULT 0,
  xp_awarded int NOT NULL DEFAULT 0,
  premium_days_awarded int NOT NULL DEFAULT 0,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_count)
);

GRANT SELECT ON public.referral_milestone_payouts TO authenticated;
GRANT ALL ON public.referral_milestone_payouts TO service_role;

ALTER TABLE public.referral_milestone_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own milestone payouts"
ON public.referral_milestone_payouts
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Block client writes on milestone payouts"
ON public.referral_milestone_payouts
AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

-- 2. referral_signals
CREATE TABLE public.referral_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_id uuid NOT NULL,
  referrer_id uuid NOT NULL,
  referred_id uuid,
  signal_type text NOT NULL,  -- same_ip | same_device_fp | same_payment | same_phone | rapid_signup_burst | self_attempt
  weight int NOT NULL DEFAULT 25,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_signals_referral_id ON public.referral_signals(referral_id);
CREATE INDEX idx_referral_signals_referrer_id ON public.referral_signals(referrer_id);

GRANT SELECT ON public.referral_signals TO authenticated;
GRANT ALL ON public.referral_signals TO service_role;

ALTER TABLE public.referral_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referrers read own signals"
ON public.referral_signals
FOR SELECT TO authenticated
USING (auth.uid() = referrer_id);

CREATE POLICY "Block client writes on referral signals"
ON public.referral_signals
AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

-- 3. Extend referrals with fraud signals
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS signup_ip text;

CREATE INDEX IF NOT EXISTS idx_referrals_device_fp ON public.referrals(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_signup_ip ON public.referrals(signup_ip) WHERE signup_ip IS NOT NULL;

-- 4. risk score
CREATE OR REPLACE FUNCTION public.referral_risk_score(_referral_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(weight), 0)::int
  FROM public.referral_signals
  WHERE referral_id = _referral_id;
$$;

-- 5. signup coins (250) idempotent: stored as one-time via reason+metadata referral_id
CREATE OR REPLACE FUNCTION public.award_referral_signup_coins(_referral_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _referrer uuid;
  _already boolean;
BEGIN
  SELECT referrer_id INTO _referrer
  FROM public.referrals WHERE id = _referral_id;

  IF _referrer IS NULL THEN
    RETURN 0;
  END IF;

  -- one-shot via ledger metadata
  SELECT EXISTS(
    SELECT 1 FROM public.coin_transactions
    WHERE user_id = _referrer
      AND reason = 'referral_signup'
      AND metadata->>'referral_id' = _referral_id::text
  ) INTO _already;

  IF _already THEN
    RETURN 0;
  END IF;

  RETURN public.award_coins(_referrer, 250, 'referral_signup',
    jsonb_build_object('referral_id', _referral_id));
END;
$$;

-- 6. milestone payout
CREATE OR REPLACE FUNCTION public.award_referral_milestones(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _paid_count int;
  _tier record;
  _payouts jsonb := '[]'::jsonb;
  _current_xp int;
  _current_premium timestamptz;
  _new_premium timestamptz;
  _coins_given int;
  _max_risk int;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;

  -- Block if any contributing referral has high risk
  SELECT COALESCE(MAX(public.referral_risk_score(r.id)), 0) INTO _max_risk
  FROM public.referrals r
  WHERE r.referrer_id = _user_id AND r.purchase_completed = true;

  IF _max_risk >= 100 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'high_risk', 'risk', _max_risk);
  END IF;

  SELECT COUNT(*) INTO _paid_count
  FROM public.referrals
  WHERE referrer_id = _user_id AND purchase_completed = true;

  FOR _tier IN
    SELECT * FROM (VALUES
      (1, 250, 100, 0),
      (3, 1000, 500, 0),
      (10, 5000, 2000, 0),
      (20, 10000, 10000, 36500)
    ) AS t(milestone_count, coins, xp, premium_days)
    WHERE t.milestone_count <= _paid_count
  LOOP
    -- skip if already paid
    IF EXISTS (
      SELECT 1 FROM public.referral_milestone_payouts
      WHERE user_id = _user_id AND milestone_count = _tier.milestone_count
    ) THEN
      CONTINUE;
    END IF;

    -- coins
    _coins_given := public.award_coins(_user_id, _tier.coins, 'referral_milestone',
      jsonb_build_object('milestone_count', _tier.milestone_count));

    -- xp
    SELECT xp INTO _current_xp FROM public.profiles WHERE user_id = _user_id;
    PERFORM public.update_profile_internal(_user_id,
      jsonb_build_object('xp', COALESCE(_current_xp, 0) + _tier.xp));

    -- premium days (only milestone 20 currently)
    IF _tier.premium_days > 0 THEN
      SELECT premium_until INTO _current_premium FROM public.profiles WHERE user_id = _user_id;
      IF _current_premium IS NULL OR _current_premium < now() THEN
        _new_premium := now() + (_tier.premium_days || ' days')::interval;
      ELSE
        _new_premium := _current_premium + (_tier.premium_days || ' days')::interval;
      END IF;
      PERFORM public.update_profile_internal(_user_id, jsonb_build_object(
        'is_premium', true,
        'premium_until', to_char(_new_premium AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ));
    END IF;

    INSERT INTO public.referral_milestone_payouts
      (user_id, milestone_count, coins_awarded, xp_awarded, premium_days_awarded)
    VALUES (_user_id, _tier.milestone_count, _coins_given, _tier.xp, _tier.premium_days);

    _payouts := _payouts || jsonb_build_object(
      'milestone', _tier.milestone_count,
      'coins', _coins_given,
      'xp', _tier.xp,
      'premium_days', _tier.premium_days
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'paid_count', _paid_count, 'payouts', _payouts);
END;
$$;

-- 7. Update redeem_referral to accept fingerprint + record signals + award signup coins
CREATE OR REPLACE FUNCTION public.redeem_referral(_code text, _fingerprint text DEFAULT NULL, _ip text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ref_id uuid;
  _referrer uuid;
  _existing_fp_count int;
  _existing_ip_count int;
  _recent_count int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, referrer_id INTO _ref_id, _referrer
  FROM public.referrals
  WHERE referral_code = upper(_code) AND referred_id IS NULL
  LIMIT 1;

  IF _ref_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _referrer = _uid THEN
    -- record self-attempt signal then block
    INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
    VALUES (_ref_id, _referrer, _uid, 'self_attempt', 100, '{}'::jsonb);
    RAISE EXCEPTION 'Cannot redeem your own referral';
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = _uid) THEN
    RAISE EXCEPTION 'Referral already redeemed';
  END IF;

  UPDATE public.referrals
  SET referred_id = _uid,
      device_fingerprint = COALESCE(_fingerprint, device_fingerprint),
      signup_ip = COALESCE(_ip, signup_ip),
      redeemed_at = COALESCE(redeemed_at, now()),
      retention_eligible_at = COALESCE(retention_eligible_at, now() + interval '30 days')
  WHERE id = _ref_id AND referred_id IS NULL;

  -- Fraud signals
  IF _fingerprint IS NOT NULL THEN
    SELECT COUNT(*) INTO _existing_fp_count
    FROM public.referrals
    WHERE device_fingerprint = _fingerprint
      AND id <> _ref_id
      AND (referrer_id = _referrer OR referred_id = _referrer);
    IF _existing_fp_count > 0 THEN
      INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
      VALUES (_ref_id, _referrer, _uid, 'same_device_fp', 60, jsonb_build_object('matches', _existing_fp_count));
    END IF;
  END IF;

  IF _ip IS NOT NULL THEN
    SELECT COUNT(*) INTO _existing_ip_count
    FROM public.referrals
    WHERE signup_ip = _ip
      AND id <> _ref_id
      AND (referrer_id = _referrer OR referred_id = _referrer);
    IF _existing_ip_count > 0 THEN
      INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
      VALUES (_ref_id, _referrer, _uid, 'same_ip', 30, jsonb_build_object('matches', _existing_ip_count));
    END IF;
  END IF;

  -- rapid signup burst: >3 redemptions from this referrer in last 24h
  SELECT COUNT(*) INTO _recent_count
  FROM public.referrals
  WHERE referrer_id = _referrer
    AND redeemed_at > now() - interval '24 hours';
  IF _recent_count > 3 THEN
    INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
    VALUES (_ref_id, _referrer, _uid, 'rapid_signup_burst', 40, jsonb_build_object('count_24h', _recent_count));
  END IF;

  -- Award the join XP bonus immediately
  PERFORM public.award_referral_join_xp(_ref_id);
  -- And immediate signup coins (250)
  PERFORM public.award_referral_signup_coins(_ref_id);

  RETURN _ref_id;
END;
$$;

-- 8. Wire retention payout to also trigger milestones + risk gate
CREATE OR REPLACE FUNCTION public.award_referral_retention_xp(_referral_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _referrer uuid;
  _referred uuid;
  _already boolean;
  _eligible timestamptz;
  _current_xp int;
  _has_sub boolean;
  _risk int;
BEGIN
  SELECT referrer_id, referred_id, retention_xp_awarded, retention_eligible_at
    INTO _referrer, _referred, _already, _eligible
  FROM public.referrals
  WHERE id = _referral_id
  FOR UPDATE;

  IF _referrer IS NULL OR _already OR _referred IS NULL THEN
    RETURN false;
  END IF;

  IF _eligible IS NULL OR _eligible > now() THEN
    RETURN false;
  END IF;

  _risk := public.referral_risk_score(_referral_id);
  IF _risk >= 100 THEN
    RETURN false;
  END IF;

  _has_sub := public.has_active_subscription(_referred, 'live')
              OR public.has_active_subscription(_referred, 'test');

  IF NOT _has_sub THEN
    RETURN false;
  END IF;

  SELECT xp INTO _current_xp FROM public.profiles WHERE user_id = _referrer;

  PERFORM public.update_profile_internal(
    _referrer,
    jsonb_build_object('xp', COALESCE(_current_xp, 0) + 400)
  );

  UPDATE public.referrals
  SET retention_xp_awarded = true,
      purchase_completed = true
  WHERE id = _referral_id;

  -- Trigger milestone payouts (idempotent)
  PERFORM public.award_referral_milestones(_referrer);

  RETURN true;
END;
$$;
