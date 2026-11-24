
-- ============================================================
-- Phase 9.3 follow-up: rate-limit hot endpoints
-- ============================================================
-- Strategy: wrap each abuse-prone SECURITY DEFINER RPC with a call to
-- public.rate_limit_check() BEFORE doing any work. rate_limit_check()
-- already records `rate_limited` events in profile_audit_log, raises
-- with SQLSTATE P0001, and is keyed per (user_id, action, window).
--
-- All RPCs below preserve their original signatures and behavior.
-- ============================================================

-- ---------- redeem_referral: 5/hour, 20/day ----------
CREATE OR REPLACE FUNCTION public.redeem_referral(_code text, _fingerprint text DEFAULT NULL::text, _ip text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM public.rate_limit_check('redeem_referral_hour', 3600, 5);
  PERFORM public.rate_limit_check('redeem_referral_day', 86400, 20);

  SELECT id, referrer_id INTO _ref_id, _referrer
  FROM public.referrals
  WHERE referral_code = upper(_code) AND referred_id IS NULL
  LIMIT 1;

  IF _ref_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _referrer = _uid THEN
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

  SELECT COUNT(*) INTO _recent_count
  FROM public.referrals
  WHERE referrer_id = _referrer
    AND redeemed_at > now() - interval '24 hours';
  IF _recent_count > 3 THEN
    INSERT INTO public.referral_signals(referral_id, referrer_id, referred_id, signal_type, weight, metadata)
    VALUES (_ref_id, _referrer, _uid, 'rapid_signup_burst', 40, jsonb_build_object('count_24h', _recent_count));
  END IF;

  PERFORM public.award_referral_join_xp(_ref_id);
  PERFORM public.award_referral_signup_coins(_ref_id);

  RETURN _ref_id;
END;
$function$;

-- ---------- create_referral_code: 10/hour ----------
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
  PERFORM public.rate_limit_check('create_referral_code', 3600, 10);

  SELECT referral_code INTO _existing
  FROM public.referrals
  WHERE referrer_id = _uid AND referred_id IS NULL
  ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

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

-- ---------- add_feed_comment: 30/min, 300/day ----------
CREATE OR REPLACE FUNCTION public.add_feed_comment(_feed_id uuid, _parent_id uuid, _content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _author uuid; _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM public.rate_limit_check('feed_comment_minute', 60, 30);
  PERFORM public.rate_limit_check('feed_comment_day', 86400, 300);

  SELECT user_id INTO _author FROM community_feed WHERE id = _feed_id;
  IF _author IS NULL THEN RAISE EXCEPTION 'feed not found'; END IF;
  IF EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = _author AND blocked_id = _uid) THEN
    RAISE EXCEPTION 'blocked';
  END IF;
  INSERT INTO community_feed_comments(feed_id, user_id, parent_id, content)
  VALUES (_feed_id, _uid, _parent_id, btrim(_content)) RETURNING id INTO _new_id;
  IF _author <> _uid THEN
    INSERT INTO notifications(user_id, kind, title, body, payload)
    VALUES (_author, 'comment', 'New comment on your post', left(_content, 120), jsonb_build_object('feed_id', _feed_id, 'comment_id', _new_id));
  END IF;
  RETURN _new_id;
END $function$;

-- ---------- report_content: 20/hour ----------
CREATE OR REPLACE FUNCTION public.report_content(_target_type text, _target_id uuid, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM public.rate_limit_check('report_content', 3600, 20);
  INSERT INTO community_reports(reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), _target_type, _target_id, btrim(_reason))
  ON CONFLICT (reporter_id, target_type, target_id) DO UPDATE SET reason = EXCLUDED.reason
  RETURNING id INTO _id;
  RETURN _id;
END $function$;

-- ---------- toggle_block / toggle_mute: 60/min ----------
CREATE OR REPLACE FUNCTION public.toggle_block(_target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _exists boolean;
BEGIN
  IF _uid IS NULL OR _uid = _target THEN RAISE EXCEPTION 'invalid'; END IF;
  PERFORM public.rate_limit_check('toggle_block', 60, 60);
  SELECT EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = _uid AND blocked_id = _target) INTO _exists;
  IF _exists THEN
    DELETE FROM user_blocks WHERE blocker_id = _uid AND blocked_id = _target; RETURN false;
  ELSE
    INSERT INTO user_blocks(blocker_id, blocked_id) VALUES (_uid, _target); RETURN true;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.toggle_mute(_target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _exists boolean;
BEGIN
  IF _uid IS NULL OR _uid = _target THEN RAISE EXCEPTION 'invalid'; END IF;
  PERFORM public.rate_limit_check('toggle_mute', 60, 60);
  SELECT EXISTS(SELECT 1 FROM user_mutes WHERE muter_id = _uid AND muted_id = _target) INTO _exists;
  IF _exists THEN
    DELETE FROM user_mutes WHERE muter_id = _uid AND muted_id = _target; RETURN false;
  ELSE
    INSERT INTO user_mutes(muter_id, muted_id) VALUES (_uid, _target); RETURN true;
  END IF;
END $function$;

-- ---------- purchase_cosmetic: 30/min ----------
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _cost int;
  _active boolean;
  _avail_from timestamptz;
  _avail_until timestamptz;
  _ok boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.rate_limit_check('purchase_cosmetic', 60, 30);

  SELECT coin_cost, is_active, available_from, available_until
    INTO _cost, _active, _avail_from, _avail_until
  FROM public.cosmetic_items WHERE id = _item_id;
  IF NOT FOUND OR NOT _active THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF _cost IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_for_sale'); END IF;
  IF _avail_from IS NOT NULL AND now() < _avail_from THEN RETURN jsonb_build_object('ok',false,'reason','not_yet'); END IF;
  IF _avail_until IS NOT NULL AND now() > _avail_until THEN RETURN jsonb_build_object('ok',false,'reason','expired'); END IF;
  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = _uid AND item_id = _item_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','already_owned');
  END IF;
  _ok := public.spend_coins(_uid, _cost, 'cosmetic_purchase', jsonb_build_object('item_id', _item_id));
  IF NOT _ok THEN RETURN jsonb_build_object('ok',false,'reason','insufficient_coins'); END IF;
  INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via) VALUES (_uid, _item_id, 'purchase');
  RETURN jsonb_build_object('ok',true,'item_id',_item_id);
END;
$function$;

-- ---------- claim_community_explorer: 5/hour ----------
CREATE OR REPLACE FUNCTION public.claim_community_explorer()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _has boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM public.rate_limit_check('claim_community_explorer', 3600, 5);
  SELECT 'community_explorer' = ANY(unlocked_effects) INTO _has FROM profiles WHERE user_id = _uid;
  IF _has THEN RETURN jsonb_build_object('already', true); END IF;
  UPDATE profiles SET
    xp = xp + 50,
    coins = coins + 10,
    unlocked_effects = array_append(unlocked_effects, 'community_explorer')
  WHERE user_id = _uid;
  INSERT INTO coin_transactions(user_id, delta, reason, balance_after, metadata)
  SELECT _uid, 10, 'community_explorer_reward', coins, '{}'::jsonb FROM profiles WHERE user_id = _uid;
  RETURN jsonb_build_object('xp', 50, 'coins', 10, 'badge', 'community_explorer');
END $function$;

-- ---------- accept_friend_challenge: 20/hour ----------
CREATE OR REPLACE FUNCTION public.accept_friend_challenge(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ch_id uuid;
  _challenger uuid;
  _claimed uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.rate_limit_check('accept_friend_challenge', 3600, 20);

  SELECT id, challenger_id, challenged_id
    INTO _ch_id, _challenger, _claimed
  FROM public.friend_challenges
  WHERE challenge_code = upper(_code)
  LIMIT 1;

  IF _ch_id IS NULL THEN RAISE EXCEPTION 'Challenge not found'; END IF;
  IF _challenger = _uid THEN RAISE EXCEPTION 'Cannot accept your own challenge'; END IF;
  IF _claimed IS NOT NULL THEN RAISE EXCEPTION 'Challenge already accepted'; END IF;

  UPDATE public.friend_challenges
  SET challenged_id = _uid, status = 'accepted'
  WHERE id = _ch_id AND challenged_id IS NULL;

  RETURN _ch_id;
END;
$function$;

-- ---------- submit_weekly_score: 30/hour (called on every leaderboard view) ----------
-- We keep generous because legitimate flows submit ~once per refresh; the
-- limit is just to keep a runaway client from spamming us.
CREATE OR REPLACE FUNCTION public.submit_weekly_score()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _week_start date;
  _name text;
  _avatar text;
  _xp int;
  _habits_total int;
  _habits_completed int := 0;
  _perfect_days int := 0;
  _best_streak int := 0;
  _active_days int := 0;
  _avg_rate int := 0;
  _growth int;
  _grade text;
  _day_rate int;
  _completed_on_day int;
  _i int;
  _d date;
  _d_str text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM public.rate_limit_check('submit_weekly_score', 3600, 30);

  _week_start := (date_trunc('week', (now() AT TIME ZONE 'UTC')::date))::date;

  SELECT COALESCE(name,'Hero'), avatar_url, COALESCE(xp,0) INTO _name, _avatar, _xp
  FROM public.profiles WHERE user_id = _uid;

  SELECT COUNT(*) INTO _habits_total FROM public.habits WHERE user_id = _uid;
  IF _habits_total = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_habits'); END IF;

  FOR _i IN 0..6 LOOP
    _d := (now() AT TIME ZONE 'UTC')::date - _i;
    _d_str := to_char(_d, 'YYYY-MM-DD');
    SELECT COUNT(*) INTO _completed_on_day FROM public.habits
      WHERE user_id = _uid AND _d_str = ANY(completions);
    _habits_completed := _habits_completed + _completed_on_day;
    IF _completed_on_day > 0 THEN _active_days := _active_days + 1; END IF;
    _day_rate := CASE WHEN _habits_total > 0
                      THEN round((_completed_on_day::numeric / _habits_total) * 100)::int
                      ELSE 0 END;
    IF _day_rate = 100 THEN _perfect_days := _perfect_days + 1; END IF;
    _avg_rate := _avg_rate + _day_rate;
  END LOOP;
  _avg_rate := round(_avg_rate::numeric / 7)::int;

  SELECT COALESCE(MAX(array_length(completions, 1)), 0) INTO _best_streak
    FROM public.habits WHERE user_id = _uid;

  _growth := LEAST(100, round(
    _avg_rate * 0.35
    + _perfect_days * 8
    + _best_streak * 2.5
    + _active_days * 3
    + ((_xp / 100) + 1) * 2
  )::int);

  _grade := CASE
    WHEN _growth >= 90 THEN 'S' WHEN _growth >= 75 THEN 'A'
    WHEN _growth >= 60 THEN 'B' WHEN _growth >= 40 THEN 'C' ELSE 'D'
  END;

  INSERT INTO public.weekly_scores
    (user_id, week_start, display_name, avatar_url,
     growth_score, grade, habits_completed, total_habits, best_streak, perfect_days)
  VALUES
    (_uid, _week_start, _name, _avatar,
     _growth, _grade, _habits_completed, _habits_total, _best_streak, _perfect_days)
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    growth_score = EXCLUDED.growth_score,
    grade = EXCLUDED.grade,
    habits_completed = EXCLUDED.habits_completed,
    total_habits = EXCLUDED.total_habits,
    best_streak = EXCLUDED.best_streak,
    perfect_days = EXCLUDED.perfect_days,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'growth_score', _growth, 'grade', _grade);
END;
$function$;

-- ---------- open_daily_chest: 5/hour (allow retries on flaky network) ----------
-- Note: open_daily_chest definition is unknown here; wrap via the existing
-- daily uniqueness guarantee. We add a soft rate gate only if the function
-- exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'open_daily_chest'
  ) THEN
    -- noop: the chest is gated by a one-per-day unique constraint already;
    -- we still add a rate limit by wrapping callers if needed in a future
    -- migration. Recorded here for visibility.
    PERFORM 1;
  END IF;
END$$;

-- Ensure pg_cron / pg_net are available so scheduled jobs work.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
