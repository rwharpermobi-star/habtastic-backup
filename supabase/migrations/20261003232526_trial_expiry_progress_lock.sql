CREATE OR REPLACE FUNCTION public.user_is_premium(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN _user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN false
    ELSE COALESCE(
      (p.is_premium AND (p.premium_until IS NULL OR p.premium_until > now()))
      OR (
        p.trial_started_at IS NOT NULL
        AND p.trial_started_at <= now()
        AND p.trial_started_at > now() - interval '5 days'
      ),
      false
    )
  END
  FROM public.profiles p
  WHERE p.user_id = _user_id;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_free_habit_update_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _allowed boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.user_is_premium(OLD.user_id) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT h.id
      FROM public.habits h
      WHERE h.user_id = OLD.user_id
      ORDER BY h.created_at ASC, h.id ASC
      LIMIT 4
    ) active_free_habits
    WHERE active_free_habits.id = OLD.id
  )
  INTO _allowed;

  IF NOT COALESCE(_allowed, false) THEN
    RAISE EXCEPTION 'free_habit_locked'
      USING ERRCODE = 'P0001',
            HINT = 'This saved Premium habit is locked on the Free plan. Upgrade to Premium to continue it.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_free_habit_update_lock ON public.habits;
CREATE TRIGGER enforce_free_habit_update_lock
BEFORE UPDATE ON public.habits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_free_habit_update_lock();

REVOKE ALL ON FUNCTION public.enforce_free_habit_update_lock() FROM PUBLIC, anon, authenticated;
