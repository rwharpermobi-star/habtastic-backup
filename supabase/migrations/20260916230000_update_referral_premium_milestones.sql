-- Referral Premium milestones are earned only from server-verified paid referrals.
-- Replace the previous 1 / 3 / 20 milestone schedule with:
--   10 qualified paid referrals -> 7 days Premium
--   25 qualified paid referrals -> 14 days Premium
--   50 qualified paid referrals -> 30 days Premium
-- Existing rewards already recorded in referral_rewards are preserved.

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
    SELECT * FROM (VALUES
      (10, 7),
      (25, 14),
      (50, 30)
    ) AS t(milestone, days)
    WHERE t.milestone <= _qualified
    ORDER BY t.milestone
  LOOP
    _kind := 'days';

    SELECT COALESCE(premium_until, now()) INTO _current
      FROM public.profiles WHERE user_id = r.referrer_id FOR UPDATE;

    _new_until := GREATEST(COALESCE(_current, now()), now()) + (_m.days || ' days')::interval;

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
           reward_days = _m.days
     WHERE id = r.id;

    INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (
      r.referrer_id,
      'referral',
      _m.days || ' Days Premium unlocked 🎁',
      'You reached ' || _m.milestone || ' qualified paid referrals — ' || _m.days
        || ' free days were added to your Premium.',
      jsonb_build_object('milestone', _m.milestone, 'kind', _kind, 'days', _m.days)
    );

    _rewards := _rewards || jsonb_build_object('milestone', _m.milestone, 'kind', _kind, 'days', _m.days);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'qualified_count', _qualified, 'rewards', _rewards);
END $$;

REVOKE ALL ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral_payment(uuid, text, text, text) TO service_role;
