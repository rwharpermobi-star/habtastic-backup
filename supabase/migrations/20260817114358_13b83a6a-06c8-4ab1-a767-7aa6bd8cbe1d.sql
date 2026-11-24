-- 1. Referral qualification tracking columns
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS qualifying_payment_reference text,
  ADD COLUMN IF NOT EXISTS qualifying_provider text;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_unique_referred
  ON public.referrals (referred_id) WHERE referred_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referrals_unique_qualified_reference
  ON public.referrals (qualifying_payment_reference)
  WHERE qualifying_payment_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS referrals_referrer_qualified_idx
  ON public.referrals (referrer_id) WHERE qualified_at IS NOT NULL;

-- 2. Permanent milestone reward ledger
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  milestone integer NOT NULL,
  reward_kind text NOT NULL,
  reward_days integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  premium_until_after timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, milestone)
);

GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT ALL ON public.referral_rewards TO service_role;

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own referral rewards" ON public.referral_rewards;
CREATE POLICY "Users read own referral rewards"
  ON public.referral_rewards FOR SELECT TO authenticated
  USING (referrer_id = auth.uid());

CREATE INDEX IF NOT EXISTS referral_rewards_referrer_idx ON public.referral_rewards (referrer_id);

-- 3. Expose qualification state to the owner via the safe view
DROP VIEW IF EXISTS public.referrals_safe;
CREATE VIEW public.referrals_safe
WITH (security_invoker = true) AS
  SELECT id, referrer_id, referred_id, referral_code, reward_days, rewarded,
         purchase_completed, qualified_at, redeemed_at, created_at
  FROM public.referrals
  WHERE referrer_id = auth.uid() OR referred_id = auth.uid();

GRANT SELECT ON public.referrals_safe TO authenticated;

-- 4. Server-authoritative qualification + milestone reward engine
CREATE OR REPLACE FUNCTION public.qualify_referral_payment(
  _referred_id uuid,
  _reference text,
  _provider text DEFAULT 'paystack',
  _environment text DEFAULT 'live'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.referrals;
  _qualified int;
  _m record;
  _current timestamptz;
  _new_until timestamptz;
  _kind text;
  _earliest_paid timestamptz;
  _rewards jsonb := '[]'::jsonb;
  _sub_active boolean;
BEGIN
  IF _referred_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_user');
  END IF;

  IF COALESCE(_environment, 'live') <> 'live' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'non_live_payment');
  END IF;

  SELECT * INTO r FROM public.referrals
   WHERE referred_id = _referred_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referral');
  END IF;
  IF r.referrer_id = _referred_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;
  IF r.qualified_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_qualified');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = _referred_id
       AND p.is_premium = true
       AND (p.premium_until IS NULL OR p.premium_until > now())
  ) INTO _sub_active;
  IF NOT _sub_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'subscription_not_active');
  END IF;

  SELECT MIN(created_at) INTO _earliest_paid
    FROM public.premium_grants WHERE user_id = _referred_id;
  IF _earliest_paid IS NOT NULL
     AND _earliest_paid < COALESCE(r.redeemed_at, r.created_at) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'premium_predates_referral');
  END IF;

  UPDATE public.referrals
     SET purchase_completed = true,
         qualified_at = now(),
         qualifying_payment_reference = _reference,
         qualifying_provider = _provider
   WHERE id = r.id;

  SELECT COUNT(*) INTO _qualified FROM public.referrals
   WHERE referrer_id = r.referrer_id AND qualified_at IS NOT NULL;

  FOR _m IN
    SELECT * FROM (VALUES (1, 7), (3, 30), (20, 0)) AS t(milestone, days)
     WHERE t.milestone <= _qualified
     ORDER BY t.milestone
  LOOP
    _kind := CASE WHEN _m.days = 0 THEN 'lifetime' ELSE 'days' END;

    SELECT COALESCE(premium_until, now()) INTO _current
      FROM public.profiles WHERE user_id = r.referrer_id FOR UPDATE;

    IF _kind = 'lifetime' THEN
      _new_until := timestamptz '2999-12-31 00:00:00+00';
    ELSE
      _new_until := GREATEST(COALESCE(_current, now()), now()) + (_m.days || ' days')::interval;
    END IF;

    BEGIN
      INSERT INTO public.referral_rewards
        (referrer_id, milestone, reward_kind, reward_days, qualified_count, premium_until_after)
      VALUES (r.referrer_id, _m.milestone, _kind, _m.days, _qualified, _new_until);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    UPDATE public.profiles
       SET is_premium = true,
           premium_until = CASE
             WHEN premium_until IS NOT NULL
                  AND premium_until > _new_until THEN premium_until
             ELSE _new_until END,
           updated_at = now()
     WHERE user_id = r.referrer_id;

    UPDATE public.referrals
       SET rewarded = true,
           reward_days = CASE WHEN _kind = 'lifetime' THEN 36500 ELSE _m.days END
     WHERE id = r.id;

    INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (
      r.referrer_id,
      'referral',
      CASE WHEN _kind = 'lifetime' THEN 'Lifetime Premium unlocked 🏆'
           ELSE _m.days || ' Days Premium unlocked 🎁' END,
      CASE WHEN _kind = 'lifetime'
           THEN 'You hit 20 paid referrals — Premium is yours for life.'
           ELSE 'A friend you invited subscribed to Premium. ' || _m.days
                || ' free days were added to your Premium.' END,
      jsonb_build_object('milestone', _m.milestone, 'kind', _kind, 'days', _m.days)
    );

    _rewards := _rewards || jsonb_build_object('milestone', _m.milestone, 'kind', _kind, 'days', _m.days);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'qualified_count', _qualified, 'rewards', _rewards);
END $$;

REVOKE ALL ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) TO service_role;