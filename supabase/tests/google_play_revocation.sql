-- Google Play refund / chargeback scenarios against the real schema.
-- Runs inside one DO block and ALWAYS rolls back: the final RAISE reports
-- "GPLAY_REVOCATION_TESTS_PASSED" (or the first failed assertion) and
-- discards every row it created. now() is fixed for the whole transaction,
-- so dates are compared exactly.
DO $$
DECLARE
  u_plain uuid := gen_random_uuid();
  u_bonus uuid := gen_random_uuid();
  u_other uuid := gen_random_uuid();
  u_life uuid := gen_random_uuid();
  u_late uuid := gen_random_uuid();
  r jsonb;
  p record;
  s record;
  meta jsonb := jsonb_build_object('source','google_play_rtdn','verification_authority','google_play_api','latest_order_id','GPA.1');
  u uuid;
BEGIN
  FOREACH u IN ARRAY ARRAY[u_plain, u_bonus, u_other, u_life, u_late] LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    VALUES (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'gplay-test-' || u || '@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = u) THEN
      INSERT INTO public.profiles (user_id) VALUES (u);
    END IF;
    UPDATE public.profiles SET is_premium = false, premium_until = NULL, trial_started_at = NULL WHERE user_id = u;
  END LOOP;

  -- 1. Refunded subscription with nothing else: Premium ends immediately.
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_code, plan_code, plan_interval, status, current_period_end, metadata)
  VALUES (u_plain, 'google_play', 'tok-plain', 'habtastic_premium_monthly', 'monthly', 'active', now() + interval '30 days', meta);
  SELECT is_premium, premium_until INTO p FROM public.profiles WHERE user_id = u_plain;
  IF NOT p.is_premium OR p.premium_until <> now() + interval '30 days' THEN RAISE EXCEPTION 'FAIL 1a: purchase did not grant Premium'; END IF;

  r := public.apply_google_play_revocation(u_plain, 'tok-plain', 'GPA.1', 'revoked');
  SELECT is_premium, premium_until INTO p FROM public.profiles WHERE user_id = u_plain;
  IF NOT (r->>'applied')::boolean OR NOT (r->>'premium_removed')::boolean THEN RAISE EXCEPTION 'FAIL 1b: %', r; END IF;
  IF p.is_premium OR p.premium_until IS NOT NULL THEN RAISE EXCEPTION 'FAIL 1c: Premium kept after refund (%/%)', p.is_premium, p.premium_until; END IF;
  SELECT status INTO s FROM public.subscriptions WHERE provider_subscription_code = 'tok-plain';
  IF s.status <> 'refunded' THEN RAISE EXCEPTION 'FAIL 1d: status %', s.status; END IF;

  -- 2. Duplicate notice (REVOKED then VOIDED chargeback for the same order): no second change, label sharpened.
  r := public.apply_google_play_revocation(u_plain, 'tok-plain', 'GPA.1', 'chargeback');
  IF (r->>'applied')::boolean OR NOT (r->>'duplicate')::boolean THEN RAISE EXCEPTION 'FAIL 2a: %', r; END IF;
  IF (SELECT reason FROM public.google_play_revocations WHERE purchase_token = 'tok-plain') <> 'chargeback' THEN RAISE EXCEPTION 'FAIL 2b: chargeback label'; END IF;

  -- 3. Google later reports the refunded order as active again: Premium stays off.
  UPDATE public.subscriptions SET status = 'active', current_period_end = now() + interval '30 days', metadata = meta
  WHERE provider_subscription_code = 'tok-plain';
  SELECT is_premium INTO p FROM public.profiles WHERE user_id = u_plain;
  SELECT status INTO s FROM public.subscriptions WHERE provider_subscription_code = 'tok-plain';
  IF p.is_premium OR s.status <> 'refunded' THEN RAISE EXCEPTION 'FAIL 3: refunded order re-activated Premium'; END IF;

  -- 4. A genuinely new paid order (renewal) re-activates Premium.
  UPDATE public.subscriptions SET status = 'active', current_period_end = now() + interval '60 days',
         metadata = meta || jsonb_build_object('latest_order_id', 'GPA.1..1')
  WHERE provider_subscription_code = 'tok-plain';
  SELECT is_premium, premium_until INTO p FROM public.profiles WHERE user_id = u_plain;
  IF NOT p.is_premium OR p.premium_until <> now() + interval '60 days' THEN RAISE EXCEPTION 'FAIL 4: new paid order not granted'; END IF;

  -- 5. Referral/chest days stacked on top survive; only the refunded 30 days go.
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_code, plan_code, plan_interval, status, current_period_end, metadata)
  VALUES (u_bonus, 'google_play', 'tok-bonus', 'habtastic_premium_monthly', 'monthly', 'active', now() + interval '30 days', meta);
  UPDATE public.profiles SET premium_until = premium_until + interval '15 days' WHERE user_id = u_bonus;
  r := public.apply_google_play_revocation(u_bonus, 'tok-bonus', 'GPA.1', 'refund');
  SELECT is_premium, premium_until INTO p FROM public.profiles WHERE user_id = u_bonus;
  IF NOT p.is_premium OR p.premium_until <> now() + interval '15 days' THEN RAISE EXCEPTION 'FAIL 5: bonus days wrong (%)', p.premium_until; END IF;

  -- 6. Another active paid subscription keeps Premium to its own end date.
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_code, plan_code, plan_interval, status, current_period_end, metadata)
  VALUES (u_other, 'paystack', 'PS-other', 'yearly', 'annually', 'active', now() + interval '90 days', '{}'::jsonb);
  UPDATE public.profiles SET is_premium = true, premium_until = now() + interval '90 days' WHERE user_id = u_other;
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_code, plan_code, plan_interval, status, current_period_end, metadata)
  VALUES (u_other, 'google_play', 'tok-other', 'habtastic_premium_monthly', 'monthly', 'active', now() + interval '30 days', meta);
  r := public.apply_google_play_revocation(u_other, 'tok-other', 'GPA.1', 'refund');
  SELECT is_premium, premium_until INTO p FROM public.profiles WHERE user_id = u_other;
  IF NOT p.is_premium OR p.premium_until <> now() + interval '90 days' THEN RAISE EXCEPTION 'FAIL 6: other subscription lost (%)', p.premium_until; END IF;

  -- 7. Lifetime Premium (no end date) is never touched.
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_code, plan_code, plan_interval, status, current_period_end, metadata)
  VALUES (u_life, 'google_play', 'tok-life', 'habtastic_premium_yearly', 'annually', 'active', now() + interval '365 days', meta);
  UPDATE public.profiles SET is_premium = true, premium_until = NULL WHERE user_id = u_life;
  r := public.apply_google_play_revocation(u_life, 'tok-life', 'GPA.1', 'refund');
  SELECT is_premium, premium_until INTO p FROM public.profiles WHERE user_id = u_life;
  IF NOT p.is_premium OR p.premium_until IS NOT NULL THEN RAISE EXCEPTION 'FAIL 7: lifetime Premium changed'; END IF;

  -- 8. Refund arrives before the purchase was ever recorded: nothing granted, and the later record can't grant it.
  r := public.apply_google_play_revocation(u_late, 'tok-late', 'GPA.9', 'chargeback');
  INSERT INTO public.subscriptions (user_id, provider, provider_subscription_code, plan_code, plan_interval, status, current_period_end, metadata)
  VALUES (u_late, 'google_play', 'tok-late', 'habtastic_premium_monthly', 'monthly', 'active', now() + interval '30 days',
          meta || jsonb_build_object('latest_order_id', 'GPA.9'));
  SELECT is_premium INTO p FROM public.profiles WHERE user_id = u_late;
  IF p.is_premium THEN RAISE EXCEPTION 'FAIL 8: charged-back order granted Premium'; END IF;

  -- 9. Wrong account cannot revoke someone else's purchase.
  BEGIN
    PERFORM public.apply_google_play_revocation(u_late, 'tok-bonus', 'GPA.2', 'refund');
    RAISE EXCEPTION 'FAIL 9: cross-account revocation allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL 9%' THEN RAISE; END IF;
  END;

  -- 10. Signed-in users cannot call the revocation function.
  IF has_function_privilege('authenticated', 'public.apply_google_play_revocation(uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.apply_google_play_revocation(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 10: clients can execute revocation';
  END IF;

  RAISE EXCEPTION 'GPLAY_REVOCATION_TESTS_PASSED';
END $$;
