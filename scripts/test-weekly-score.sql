-- Run only in an empty, isolated PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f scripts/test-weekly-score.sql
BEGIN;
SET LOCAL TIME ZONE 'UTC';
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, name text, avatar_url text, xp integer);
CREATE TABLE public.habits (user_id uuid, completions text[]);
CREATE TABLE public.profile_privacy (user_id uuid PRIMARY KEY, show_on_leaderboard boolean, profile_public boolean);
CREATE FUNCTION public.is_leaderboard_visible(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profile_privacy pp WHERE pp.user_id = _user_id
    AND (pp.show_on_leaderboard = false OR pp.profile_public = false)
  );
$$;
CREATE TABLE public.weekly_scores (
  user_id uuid, week_start date, score integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, week_start)
);
ALTER TABLE public.weekly_scores ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.weekly_scores TO authenticated;
CREATE POLICY ws_view ON public.weekly_scores FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_leaderboard_visible(user_id));
CREATE POLICY "Anyone can view leaderboard scores" ON public.weekly_scores FOR SELECT USING (true);
CREATE POLICY no_client_insert ON public.weekly_scores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

INSERT INTO public.profiles VALUES
  ('00000000-0000-0000-0000-000000000001', 'First name', 'https://example.com/avatar.png', 100);
INSERT INTO public.habits VALUES
  ('00000000-0000-0000-0000-000000000001', ARRAY[
    current_date::text, current_date::text, (current_date - 1)::text,
    (current_date - 2)::text, (current_date - 4)::text,
    (current_date + 1)::text, 'invalid', '2026-99-99']),
  ('00000000-0000-0000-0000-000000000001', ARRAY[
    (current_date - 1)::text, (current_date - 2)::text, (current_date - 3)::text]),
  ('00000000-0000-0000-0000-000000000002', ARRAY[current_date::text]);
INSERT INTO public.weekly_scores(user_id, week_start, score) VALUES
  ('00000000-0000-0000-0000-000000000001', date_trunc('week', now())::date, 999),
  ('00000000-0000-0000-0000-000000000002', date_trunc('week', now())::date, 888),
  ('00000000-0000-0000-0000-000000000003', date_trunc('week', now())::date - 7, 77),
  ('00000000-0000-0000-0000-000000000004', date_trunc('week', now())::date, 999);
INSERT INTO public.profile_privacy VALUES
  ('00000000-0000-0000-0000-000000000002', false, true),
  ('00000000-0000-0000-0000-000000000003', false, true),
  ('00000000-0000-0000-0000-000000000004', true, false);

\ir ../supabase/migrations/20261030211234_refresh_weekly_leaderboard_stats.sql

DO $$
DECLARE row public.weekly_scores;
BEGIN
  SELECT * INTO STRICT row FROM public.weekly_scores
  WHERE user_id = '00000000-0000-0000-0000-000000000001';
  IF (row.score, row.growth_score, row.grade, row.display_name, row.avatar_url,
      row.habits_completed, row.total_habits, row.best_streak, row.perfect_days)
     IS DISTINCT FROM (60, 60, 'B', 'First name', 'https://example.com/avatar.png', 7, 2, 3, 2)
  THEN RAISE EXCEPTION 'stale backfilled stats: %', row; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.weekly_scores
                 WHERE user_id = '00000000-0000-0000-0000-000000000002'
                   AND score = 20 AND growth_score = 20 AND habits_completed = 1)
  THEN RAISE EXCEPTION 'another user was not backfilled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.weekly_scores
                 WHERE user_id = '00000000-0000-0000-0000-000000000004'
                   AND score = 0 AND growth_score = 0 AND grade = 'D' AND total_habits = 0)
  THEN RAISE EXCEPTION 'empty habits were not backfilled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.weekly_scores
                 WHERE user_id = '00000000-0000-0000-0000-000000000003'
                   AND week_start = date_trunc('week', now())::date - 7 AND score = 77)
     OR (SELECT COUNT(*) FROM public.weekly_scores) <> 4
  THEN RAISE EXCEPTION 'backfill changed historical rows or created extra rows'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb; row public.weekly_scores;
BEGIN
  IF EXISTS (SELECT 1 FROM public.weekly_scores WHERE user_id <> auth.uid())
  THEN RAISE EXCEPTION 'hidden score visible to another user'; END IF;
  BEGIN
    PERFORM public.refresh_weekly_score_internal('00000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'client executed internal refresh';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  result := public.submit_weekly_score();
  IF result->>'score' <> '60' THEN RAISE EXCEPTION 'incorrect score: %', result; END IF;
  SELECT * INTO STRICT row FROM public.weekly_scores;
  IF (row.score, row.growth_score, row.grade, row.display_name, row.avatar_url,
      row.habits_completed, row.total_habits, row.best_streak, row.perfect_days)
     IS DISTINCT FROM (60, 60, 'B', 'First name', 'https://example.com/avatar.png', 7, 2, 3, 2)
  THEN RAISE EXCEPTION 'incorrect stats: %', row; END IF;

  BEGIN
    INSERT INTO public.weekly_scores(user_id, week_start, score)
    VALUES (auth.uid(), current_date + 7, 100);
    RAISE EXCEPTION 'client insert unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.weekly_scores WHERE user_id = auth.uid())
  THEN RAISE EXCEPTION 'hidden user cannot view own score'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.weekly_scores WHERE user_id <> auth.uid())
  THEN RAISE EXCEPTION 'visible user was hidden'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

UPDATE public.profiles SET name = 'Updated', avatar_url = NULL, xp = 0;
UPDATE public.habits SET completions = '{}' WHERE user_id = auth.uid();
SET LOCAL ROLE authenticated;
DO $$
DECLARE row public.weekly_scores;
BEGIN
  PERFORM public.submit_weekly_score();
  SELECT * INTO STRICT row FROM public.weekly_scores;
  IF (row.score, row.growth_score, row.grade, row.display_name, row.avatar_url,
      row.habits_completed, row.total_habits, row.best_streak, row.perfect_days)
     IS DISTINCT FROM (2, 2, 'D', 'Updated', NULL::text, 0, 2, 0, 0)
  THEN RAISE EXCEPTION 'stale conflict fields: %', row; END IF;
END $$;
RESET ROLE;

DELETE FROM public.habits WHERE user_id = auth.uid();
DELETE FROM public.profiles WHERE user_id = auth.uid();
SET LOCAL ROLE authenticated;
DO $$
DECLARE row public.weekly_scores;
BEGIN
  PERFORM public.submit_weekly_score();
  SELECT * INTO STRICT row FROM public.weekly_scores;
  IF (row.score, row.growth_score, row.grade, row.display_name, row.avatar_url,
      row.habits_completed, row.total_habits, row.best_streak, row.perfect_days)
     IS DISTINCT FROM (0, 0, 'D', 'Hero', NULL::text, 0, 0, 0, 0)
  THEN RAISE EXCEPTION 'incorrect empty stats: %', row; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.submit_weekly_score();
    RAISE EXCEPTION 'missing auth was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'not_authenticated' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weekly_scores'
             AND policyname = 'Anyone can view leaderboard scores')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weekly_scores'
                    AND policyname = 'ws_view')
  THEN RAISE EXCEPTION 'incorrect leaderboard visibility policies'; END IF;
  IF has_function_privilege('anon', 'public.submit_weekly_score()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.submit_weekly_score()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.submit_weekly_score()', 'EXECUTE')
  THEN RAISE EXCEPTION 'incorrect execute grants'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.submit_weekly_score()'::regprocedure
                 AND prosecdef AND proconfig = ARRAY['search_path=public'])
  THEN RAISE EXCEPTION 'security definer/search_path changed'; END IF;
  IF has_function_privilege('anon', 'public.refresh_weekly_score_internal(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.refresh_weekly_score_internal(uuid)', 'EXECUTE')
  THEN RAISE EXCEPTION 'internal refresh exposed to clients'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.weekly_scores
                 WHERE user_id = '00000000-0000-0000-0000-000000000002'
                   AND score = 20 AND display_name = 'Hero')
  THEN RAISE EXCEPTION 'another user was changed'; END IF;
END $$;
ROLLBACK;
SELECT 'submit_weekly_score: all regression assertions passed' AS result;
