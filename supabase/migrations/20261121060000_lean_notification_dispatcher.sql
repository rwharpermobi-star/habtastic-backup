-- Lean notification dispatcher (Nov 21, 2026).
--
-- The old dispatcher ran every minute and, on every run, downloaded every
-- user's notification prefs and every habit with its full completion history.
-- That repeated download is the most likely cause of the free-plan egress
-- overrun. These two helpers let the dispatcher (now every 5 minutes) ask the
-- database which users actually have something due, and then fetch only
-- today's facts (done today, current streak, completions this week) for those
-- users instead of whole completion arrays.
--
-- Both are server-only: no anon or signed-in user can call them.
-- This migration does NOT turn the cron job on; see
-- supabase/manual/enable_lean_reminder_cron.sql for that step.

CREATE OR REPLACE FUNCTION public.notification_due_users(_now timestamptz DEFAULT now())
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH p AS (
    SELECT np.*,
           CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names t WHERE t.name = np.timezone)
                THEN np.timezone ELSE 'UTC' END AS tz
    FROM public.notification_prefs np
  ),
  l AS (
    SELECT p.*,
           (_now AT TIME ZONE p.tz) AS lt
    FROM p
  ),
  m AS (
    SELECT l.*,
           (extract(hour FROM lt)::int * 60 + extract(minute FROM lt)::int) AS mins,
           extract(hour FROM lt)::int AS hr,
           extract(minute FROM lt)::int AS mi,
           extract(dow FROM lt)::int AS dw
    FROM l
  )
  SELECT m.user_id
  FROM m
  WHERE
    (m.missed_followups_enabled AND m.hr = 21 AND m.mi < 5)
    OR (m.streak_pressure_enabled AND m.hr = 19 AND m.mi < 5)
    OR (m.comeback_enabled AND m.hr = 8 AND m.mi < 5)
    OR (
      m.weekly_recap_enabled
      AND m.weekly_recap_time ~ '^[0-9]{1,2}:[0-9]{2}'
      AND m.dw = m.weekly_recap_dow
      AND m.mins - (split_part(m.weekly_recap_time, ':', 1)::int * 60
                    + split_part(m.weekly_recap_time, ':', 2)::int) BETWEEN 0 AND 4
    )
    OR EXISTS (
      SELECT 1
      FROM public.habits h
      WHERE h.user_id = m.user_id
        AND h.reminder_enabled
        AND h.reminder_time ~ '^[0-9]{1,2}:[0-9]{2}'
        AND (
          (m.per_habit_enabled
            AND m.mins - (split_part(h.reminder_time, ':', 1)::int * 60
                          + split_part(h.reminder_time, ':', 2)::int) BETWEEN 0 AND 4)
          OR (m.missed_followups_enabled
            AND m.mins - (split_part(h.reminder_time, ':', 1)::int * 60
                          + split_part(h.reminder_time, ':', 2)::int + 60) BETWEEN 0 AND 4)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.notification_habit_snapshot(_user_id uuid, _today date)
RETURNS TABLE (
  id uuid,
  name text,
  emoji text,
  frequency text,
  custom_days integer[],
  reminder_time text,
  reminder_enabled boolean,
  reminder_tone text,
  done_today boolean,
  streak integer,
  week_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    h.id,
    h.name::text,
    h.emoji::text,
    h.frequency::text,
    h.custom_days,
    h.reminder_time::text,
    h.reminder_enabled,
    h.reminder_tone::text,
    (_today::text = ANY (h.completions)) AS done_today,
    -- Same rule as before: consecutive completed days before today, max 59.
    COALESCE(
      (SELECT min(i) - 1 FROM generate_series(1, 59) AS i
        WHERE NOT ((_today - i)::text = ANY (h.completions))),
      59
    )::int AS streak,
    (SELECT count(*) FROM unnest(h.completions) AS c
      WHERE c >= (_today - 7)::text AND c <= _today::text)::int AS week_count
  FROM public.habits h
  WHERE h.user_id = _user_id
  ORDER BY h.created_at, h.id;
$$;

REVOKE ALL ON FUNCTION public.notification_due_users(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_habit_snapshot(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_due_users(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.notification_habit_snapshot(uuid, date) TO service_role;
