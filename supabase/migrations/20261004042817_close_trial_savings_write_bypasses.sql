CREATE OR REPLACE FUNCTION public.enforce_money_saver_entry_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row_user uuid;
  _goal_id uuid;
BEGIN
  _row_user := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  _goal_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.goal_id ELSE NEW.goal_id END;

  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _row_user THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.goal_id IS DISTINCT FROM NEW.goal_id THEN
    IF NOT public.free_money_saver_goal_is_writable(OLD.user_id, OLD.goal_id) THEN
      RAISE EXCEPTION 'free_money_saver_goal_locked' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NOT public.free_money_saver_goal_is_writable(_row_user, _goal_id) THEN
    RAISE EXCEPTION 'free_money_saver_goal_locked'
      USING ERRCODE = 'P0001',
            HINT = 'This Premium savings goal is saved. Upgrade to continue it.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_money_saver_challenge_goal_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _goal_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  _uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  _goal_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.goal_id ELSE NEW.goal_id END;
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.goal_id IS NOT NULL THEN
    IF NOT public.free_money_saver_goal_is_writable(OLD.user_id, OLD.goal_id) THEN
      RAISE EXCEPTION 'free_money_saver_goal_locked' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF _goal_id IS NOT NULL AND NOT public.free_money_saver_goal_is_writable(_uid, _goal_id) THEN
    RAISE EXCEPTION 'free_money_saver_goal_locked' USING ERRCODE = 'P0001',
      HINT = 'Your savings challenge is saved. Activate Premium to continue it.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;
DROP TRIGGER IF EXISTS enforce_money_saver_challenge_goal_lock ON public.savings_challenges;
CREATE TRIGGER enforce_money_saver_challenge_goal_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.savings_challenges
FOR EACH ROW EXECUTE FUNCTION public.enforce_money_saver_challenge_goal_lock();
REVOKE ALL ON FUNCTION public.enforce_money_saver_challenge_goal_lock()
FROM PUBLIC, anon, authenticated;
