-- Restore the Free tier's four-active-habit limit at the database boundary.
-- Premium/trial access is always derived from the server-owned profile fields.
CREATE OR REPLACE FUNCTION public.enforce_free_habit_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.user_is_premium(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('habit-limit:' || NEW.user_id::text));

  SELECT count(*)::integer
    INTO _count
    FROM public.habits
   WHERE user_id = NEW.user_id;

  IF _count >= 4 THEN
    RAISE EXCEPTION 'free_habit_limit_reached'
      USING ERRCODE = 'P0001',
            HINT = 'Free accounts can have up to 4 active habits. Upgrade to Premium for unlimited habits.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_free_habit_limit ON public.habits;
CREATE TRIGGER enforce_free_habit_limit
BEFORE INSERT ON public.habits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_free_habit_limit();

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
      ) AS free_habits
     WHERE free_habits.id = OLD.id
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

REVOKE ALL ON FUNCTION public.enforce_free_habit_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_free_habit_limit() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_free_habit_update_lock() FROM PUBLIC, anon, authenticated, service_role;
