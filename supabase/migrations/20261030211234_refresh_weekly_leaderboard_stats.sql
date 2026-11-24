DROP POLICY IF EXISTS "Anyone can view leaderboard scores" ON public.weekly_scores;

ALTER TABLE public.weekly_scores
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS growth_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT 'D',
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Hero',
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS habits_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_habits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfect_days integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refresh_weekly_score_internal(_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _wk date := date_trunc('week', now())::date;
  -- Habit dates have no stored user timezone; use the server's UTC date window.
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _name text;
  _avatar text;
  _xp int;
  _habits_total int;
  _habits_completed int := 0;
  _perfect_days int := 0;
  _best_streak int := 0;
  _active_days int := 0;
  _avg_rate int := 0;
  _growth int := 0;
  _grade text;
  _completed_on_day int;
  _day_rate int;
  _completions text[];
  _streak int;
  _i int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT p.name, p.avatar_url, p.xp INTO _name, _avatar, _xp
  FROM public.profiles p WHERE p.user_id = _uid;
  _name := COALESCE(_name, 'Hero');
  _xp := COALESCE(_xp, 0);

  SELECT COUNT(*)::int INTO _habits_total
  FROM public.habits h WHERE h.user_id = _uid;

  IF _habits_total > 0 THEN
    FOR _i IN 0..6 LOOP
      SELECT COUNT(*)::int INTO _completed_on_day
      FROM public.habits h
      WHERE h.user_id = _uid
        AND to_char(_today - _i, 'YYYY-MM-DD') = ANY(h.completions);
      _habits_completed := _habits_completed + _completed_on_day;
      IF _completed_on_day > 0 THEN _active_days := _active_days + 1; END IF;
      _day_rate := round(_completed_on_day::numeric / _habits_total * 100)::int;
      IF _day_rate = 100 THEN _perfect_days := _perfect_days + 1; END IF;
      _avg_rate := _avg_rate + _day_rate;
    END LOOP;
    _avg_rate := round(_avg_rate::numeric / 7)::int;

    FOR _completions IN
      SELECT h.completions FROM public.habits h WHERE h.user_id = _uid
    LOOP
      _streak := 0;
      FOR _i IN 0..364 LOOP
        IF to_char(_today - _i, 'YYYY-MM-DD') = ANY(_completions) THEN
          _streak := _streak + 1;
        ELSIF _i > 0 THEN
          EXIT;
        END IF;
      END LOOP;
      _best_streak := GREATEST(_best_streak, _streak);
    END LOOP;

    _growth := LEAST(100, round(
      _avg_rate * 0.35 + _perfect_days * 8 + _best_streak * 2.5
      + _active_days * 3 + (floor(_xp::numeric / 100) + 1) * 2
    )::int);
  END IF;

  _grade := CASE
    WHEN _growth >= 90 THEN 'S' WHEN _growth >= 75 THEN 'A'
    WHEN _growth >= 60 THEN 'B' WHEN _growth >= 40 THEN 'C' ELSE 'D'
  END;

  INSERT INTO public.weekly_scores
    (user_id, week_start, score, growth_score, grade, display_name, avatar_url,
     habits_completed, total_habits, best_streak, perfect_days)
  VALUES
    (_uid, _wk, _growth, _growth, _grade, _name, _avatar,
     _habits_completed, _habits_total, _best_streak, _perfect_days)
  ON CONFLICT (user_id, week_start) DO UPDATE SET
    score = EXCLUDED.score,
    growth_score = EXCLUDED.growth_score,
    grade = EXCLUDED.grade,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    habits_completed = EXCLUDED.habits_completed,
    total_habits = EXCLUDED.total_habits,
    best_streak = EXCLUDED.best_streak,
    perfect_days = EXCLUDED.perfect_days;

  RETURN jsonb_build_object('ok', true, 'week_start', _wk, 'score', _growth,
                            'growth_score', _growth, 'grade', _grade);
END $function$;

REVOKE ALL ON FUNCTION public.refresh_weekly_score_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_weekly_score()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  RETURN public.refresh_weekly_score_internal(_uid);
END $function$;

REVOKE ALL ON FUNCTION public.submit_weekly_score() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_weekly_score() TO authenticated, service_role;

DO $backfill$
DECLARE
  _uid uuid;
BEGIN
  FOR _uid IN
    SELECT user_id FROM public.weekly_scores
    WHERE week_start = date_trunc('week', now())::date
  LOOP
    PERFORM public.refresh_weekly_score_internal(_uid);
  END LOOP;
END $backfill$;
