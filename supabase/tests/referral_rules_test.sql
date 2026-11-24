-- Scenario tests for 20261121030000_referral_rules_1_3_10_20_and_missing_tables.sql.
-- Run with scripts/test-referral-migration.sh; any failed check raises an error.
CREATE OR REPLACE FUNCTION pg_temp.check(_ok boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT COALESCE(_ok, false) THEN RAISE EXCEPTION 'FAIL: %', _msg; END IF; RAISE NOTICE 'ok: %', _msg; END $$;

-- helper: create a referred user that redeemed the referrer's code and paid
CREATE OR REPLACE FUNCTION pg_temp.paid_referral(_referrer uuid, _paid boolean DEFAULT true, _flag text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE u uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id) VALUES (u);
  INSERT INTO public.profiles(user_id, is_premium, premium_until) VALUES (u, _paid, CASE WHEN _paid THEN now() + interval '30 days' END);
  INSERT INTO public.referrals(referrer_id, referred_id, referral_code, redeemed_at, admin_status)
  VALUES (_referrer, u, 'CODE', now() - interval '1 hour', _flag);
  IF _paid THEN INSERT INTO public.premium_grants(user_id) VALUES (u); END IF;
  RETURN u;
END $$;

DO $$
DECLARE
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  x uuid;
  res jsonb;
  i int;
  until1 timestamptz;
BEGIN
  INSERT INTO auth.users(id) VALUES (a), (b);
  INSERT INTO public.profiles(user_id) VALUES (a), (b);

  PERFORM pg_temp.check((SELECT array_agg(milestone_count || ':' || premium_days || ':' || lifetime ORDER BY milestone_count) FROM public.referral_reward_milestones WHERE enabled)
     = ARRAY['1:7:false','3:30:false','10:90:false','20:0:true'], 'milestones are 1=7d, 3=30d, 10=90d, 20=lifetime');

  -- unpaid referral does not count
  x := pg_temp.paid_referral(a, false);
  res := public.qualify_referral_payment(x, 'ref-unpaid');
  PERFORM pg_temp.check(res->>'reason' = 'subscription_not_active', 'unpaid referral is not counted');

  -- test-mode payment does not count
  x := pg_temp.paid_referral(a);
  res := public.qualify_referral_payment(x, 'ref-test', 'paystack', 'test');
  PERFORM pg_temp.check(res->>'reason' = 'non_live_payment', 'test payment is not counted');

  -- 1st paid referral: 7 days
  res := public.qualify_referral_payment(x, 'ref-1');
  PERFORM pg_temp.check((res->>'ok')::boolean AND (res->>'qualified_count')::int = 1, 'first paid referral qualifies');
  SELECT premium_until INTO until1 FROM public.profiles WHERE user_id = a;
  PERFORM pg_temp.check(until1 BETWEEN now() + interval '7 days' - interval '1 minute' AND now() + interval '7 days' + interval '1 minute', '1 paid referral = 7 days Premium');

  -- same payment again: no double grant
  res := public.qualify_referral_payment(x, 'ref-1');
  PERFORM pg_temp.check(res->>'reason' = 'already_qualified', 'repeat qualification is refused');
  PERFORM public.apply_referral_milestones(a, NULL);
  PERFORM pg_temp.check((SELECT premium_until FROM public.profiles WHERE user_id = a) = until1, 're-applying milestones grants nothing extra');

  -- flagged (fraud review) referral does not count
  x := pg_temp.paid_referral(a, true, 'flagged');
  res := public.qualify_referral_payment(x, 'ref-flag');
  PERFORM pg_temp.check(res->>'reason' = 'flagged', 'flagged referral is not counted');

  -- premium bought before the referral does not count
  x := pg_temp.paid_referral(a);
  UPDATE public.premium_grants SET created_at = now() - interval '10 days' WHERE user_id = x;
  res := public.qualify_referral_payment(x, 'ref-old');
  PERFORM pg_temp.check(res->>'reason' = 'premium_predates_referral', 'earlier purchase is not counted');

  -- 2nd and 3rd: +30 days at 3
  PERFORM public.qualify_referral_payment(pg_temp.paid_referral(a), 'ref-2');
  PERFORM pg_temp.check((SELECT premium_until FROM public.profiles WHERE user_id = a) = until1, '2 paid referrals: no new reward');
  PERFORM public.qualify_referral_payment(pg_temp.paid_referral(a), 'ref-3');
  PERFORM pg_temp.check((SELECT premium_until FROM public.profiles WHERE user_id = a) BETWEEN until1 + interval '30 days' - interval '1 minute' AND until1 + interval '30 days' + interval '1 minute', '3 paid referrals = +30 days (stacked)');

  -- up to 10: +90 days
  FOR i IN 4..10 LOOP PERFORM public.qualify_referral_payment(pg_temp.paid_referral(a), 'ref-' || i); END LOOP;
  PERFORM pg_temp.check((SELECT premium_until FROM public.profiles WHERE user_id = a) BETWEEN until1 + interval '120 days' - interval '1 minute' AND until1 + interval '120 days' + interval '1 minute', '10 paid referrals = +90 days');

  -- up to 20: lifetime
  FOR i IN 11..20 LOOP PERFORM public.qualify_referral_payment(pg_temp.paid_referral(a), 'ref-' || i); END LOOP;
  PERFORM pg_temp.check((SELECT lifetime_premium AND is_premium AND premium_until IS NULL FROM public.profiles WHERE user_id = a), '20 paid referrals = lifetime Premium');
  PERFORM pg_temp.check((SELECT count(*) FROM public.referral_rewards WHERE referrer_id = a) = 4, 'exactly four rewards recorded');

  -- lifetime is never downgraded by subscription expiry / revocation writes
  UPDATE public.profiles SET is_premium = false, premium_until = now() - interval '1 day', lifetime_premium = false WHERE user_id = a;
  PERFORM pg_temp.check((SELECT lifetime_premium AND is_premium AND premium_until IS NULL FROM public.profiles WHERE user_id = a), 'lifetime survives expiry/revocation');

  -- an existing referrer who already qualifies gets each milestone once (backfill)
  FOR i IN 1..3 LOOP
    x := pg_temp.paid_referral(b);
    UPDATE public.referrals SET qualified_at = now() WHERE referred_id = x;
  END LOOP;
  PERFORM public.apply_referral_milestones(b, NULL);
  PERFORM public.apply_referral_milestones(b, NULL);
  PERFORM pg_temp.check((SELECT count(*) FROM public.referral_rewards WHERE referrer_id = b) = 2, 'backfill grants 1 and 3 once each');
  PERFORM pg_temp.check((SELECT premium_until FROM public.profiles WHERE user_id = b) BETWEEN now() + interval '37 days' - interval '1 minute' AND now() + interval '37 days' + interval '1 minute', 'backfill gives 7 + 30 days once');
END $$;

-- app users cannot set lifetime Premium themselves
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles SET lifetime_premium = true;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lifetime_premium AND user_id NOT IN (SELECT referrer_id FROM public.referral_rewards WHERE reward_kind = 'lifetime')) THEN
    RAISE EXCEPTION 'FAIL: authenticated could write lifetime_premium';
  END IF;
  RAISE NOTICE 'ok: app users cannot set lifetime_premium';
  BEGIN
    PERFORM public.qualify_referral_payment(gen_random_uuid(), 'x');
    RAISE EXCEPTION 'FAIL: authenticated could call qualify_referral_payment';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: app users cannot call qualify_referral_payment';
  END;
  BEGIN
    PERFORM public.apply_referral_milestones(gen_random_uuid(), NULL);
    RAISE EXCEPTION 'FAIL: authenticated could call apply_referral_milestones';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: app users cannot call apply_referral_milestones';
  END;
  RESET ROLE;
END $$;
