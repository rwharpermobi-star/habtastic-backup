-- 1) Leaderboard: remove client write access, compute score server-side
DROP POLICY IF EXISTS ws_own_write ON public.weekly_scores;
REVOKE INSERT, UPDATE, DELETE ON public.weekly_scores FROM authenticated;
GRANT SELECT ON public.weekly_scores TO authenticated;
GRANT ALL ON public.weekly_scores TO service_role;

DROP FUNCTION IF EXISTS public.submit_weekly_score(integer);

CREATE OR REPLACE FUNCTION public.submit_weekly_score()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _wk date := date_trunc('week', now())::date;
  _score int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Server-derived score: real habit completions inside the current week
  SELECT COALESCE(COUNT(*), 0)::int INTO _score
  FROM public.habits h
  CROSS JOIN LATERAL unnest(h.completions) AS c(day)
  WHERE h.user_id = _uid
    AND c.day ~ '^\d{4}-\d{2}-\d{2}$'
    AND c.day::date >= _wk
    AND c.day::date < _wk + 7;

  _score := GREATEST(0, LEAST(_score, 1000));

  INSERT INTO public.weekly_scores(user_id, week_start, score)
  VALUES (_uid, _wk, _score)
  ON CONFLICT (user_id, week_start) DO UPDATE SET score = EXCLUDED.score;

  RETURN jsonb_build_object('ok', true, 'week_start', _wk, 'score', _score);
END $function$;

-- 2) Lock down EXECUTE on public routines
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);

    IF r.proname NOT IN (
      'award_coins','award_xp','spend_coins','update_profile_internal',
      'reward_referrer','rate_limit_check_ip','handle_new_user',
      'protect_profile_fields','touch_device_tokens_updated_at'
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;

    IF r.proname = 'validate_referral_code' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;
  END LOOP;
END $$;