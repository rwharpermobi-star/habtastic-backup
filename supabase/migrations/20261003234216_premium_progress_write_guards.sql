-- Preserve Premium-created progress after entitlement expiry while enforcing
-- the Free-tier write surface at the database boundary.

-- Premium Challenges: rows remain readable/saved after expiry, but Free users
-- cannot start or advance them until Premium is active again.
CREATE OR REPLACE FUNCTION public.enforce_premium_challenge_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
BEGIN
  _uid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;

  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF _uid IS NULL OR auth.uid() IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_is_premium(_uid) THEN
    RAISE EXCEPTION 'premium_challenge_locked'
      USING ERRCODE = 'P0001',
            HINT = 'Your challenge progress is saved. Activate Premium to continue it.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_premium_challenge_write ON public.challenges;
CREATE TRIGGER enforce_premium_challenge_write
BEFORE INSERT OR UPDATE OR DELETE ON public.challenges
FOR EACH ROW
EXECUTE FUNCTION public.enforce_premium_challenge_write();

REVOKE ALL ON FUNCTION public.enforce_premium_challenge_write() FROM PUBLIC, anon, authenticated;


-- Free Money Saver users may continue one active goal. Any additional active
-- goals created during a trial/Premium period are kept intact and read-only.
CREATE OR REPLACE FUNCTION public.free_money_saver_goal_is_writable(
  _user_id uuid,
  _goal_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL OR _goal_id IS NULL THEN false
    WHEN auth.role() <> 'service_role'
      AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _user_id) THEN false
    WHEN auth.role() = 'service_role' THEN true
    WHEN public.user_is_premium(_user_id) THEN true
    ELSE COALESCE(
      _goal_id = (
        SELECT g.id
        FROM public.savings_goals g
        WHERE g.user_id = _user_id
          AND g.status = 'active'
        ORDER BY g.created_at ASC, g.id ASC
        LIMIT 1
      ),
      false
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.free_money_saver_goal_is_writable(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.free_money_saver_goal_is_writable(uuid, uuid)
TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.enforce_money_saver_goal_update_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _active_count integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.user_is_premium(OLD.user_id) THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'active'
     AND NOT public.free_money_saver_goal_is_writable(OLD.user_id, OLD.id) THEN
    RAISE EXCEPTION 'free_money_saver_goal_locked'
      USING ERRCODE = 'P0001',
            HINT = 'This Premium savings goal is saved. Upgrade to continue it.';
  END IF;

  -- Prevent reactivating an old/completed goal to bypass the one-active-goal
  -- Free allowance.
  IF OLD.status <> 'active' AND NEW.status = 'active' THEN
    SELECT count(*)::integer
      INTO _active_count
      FROM public.savings_goals g
     WHERE g.user_id = OLD.user_id
       AND g.status = 'active'
       AND g.id <> OLD.id;

    IF _active_count >= 1 THEN
      RAISE EXCEPTION 'free_money_saver_limit_reached'
        USING ERRCODE = 'P0001',
              HINT = 'Free accounts can have 1 active Money Saver goal.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_money_saver_goal_update_lock ON public.savings_goals;
CREATE TRIGGER enforce_money_saver_goal_update_lock
BEFORE UPDATE ON public.savings_goals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_money_saver_goal_update_lock();

REVOKE ALL ON FUNCTION public.enforce_money_saver_goal_update_lock()
FROM PUBLIC, anon, authenticated;


-- Entries are the actual progress ledger. Guard INSERT/UPDATE/DELETE so a
-- locked Premium goal cannot be advanced through the REST API directly.
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

  IF NOT public.free_money_saver_goal_is_writable(_row_user, _goal_id) THEN
    RAISE EXCEPTION 'free_money_saver_goal_locked'
      USING ERRCODE = 'P0001',
            HINT = 'This Premium savings goal is saved. Upgrade to continue it.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_money_saver_entry_lock ON public.savings_entries;
CREATE TRIGGER enforce_money_saver_entry_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.savings_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_money_saver_entry_lock();

REVOKE ALL ON FUNCTION public.enforce_money_saver_entry_lock()
FROM PUBLIC, anon, authenticated;


-- Harden the canonical savings-entry RPC as well. It now validates ownership,
-- active state, and the Free writable-goal slot before changing the ledger.
CREATE OR REPLACE FUNCTION public.record_savings_entry(
  _goal_id uuid,
  _amount numeric,
  _source text DEFAULT 'manual'::text,
  _note text DEFAULT NULL::text
)
RETURNS public.savings_goals
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_goal public.savings_goals;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;

  SELECT *
    INTO v_goal
    FROM public.savings_goals
   WHERE id = _goal_id
     AND user_id = v_user;

  IF v_goal.id IS NULL THEN RAISE EXCEPTION 'goal_not_found'; END IF;
  IF v_goal.status <> 'active' THEN RAISE EXCEPTION 'goal_not_active'; END IF;

  IF NOT public.free_money_saver_goal_is_writable(v_user, _goal_id) THEN
    RAISE EXCEPTION 'free_money_saver_goal_locked'
      USING ERRCODE = 'P0001',
            HINT = 'This Premium savings goal is saved. Upgrade to continue it.';
  END IF;

  INSERT INTO public.savings_entries(user_id, goal_id, amount, source, note)
  VALUES (
    v_user,
    _goal_id,
    _amount,
    CASE WHEN _source IN ('manual','initial','winston','challenge') THEN _source ELSE 'manual' END,
    nullif(trim(coalesce(_note,'')), '')
  );

  SELECT *
    INTO v_goal
    FROM public.savings_goals
   WHERE id = _goal_id
     AND user_id = v_user;

  RETURN v_goal;
END;
$function$;


-- A completed Premium challenge must not be claimed after the entitlement has
-- expired by calling the payout RPC directly. The row/reward stays intact and
-- can be claimed when Premium is active again.
CREATE OR REPLACE FUNCTION public.complete_user_challenge(_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ch public.challenges;
  _xp int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT public.user_is_premium(_uid) THEN
    RAISE EXCEPTION 'premium_challenge_locked'
      USING ERRCODE = 'P0001',
            HINT = 'Your challenge progress is saved. Activate Premium to claim or continue it.';
  END IF;

  SELECT * INTO _ch
  FROM public.challenges
  WHERE id = _challenge_id AND user_id = _uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF COALESCE(array_length(_ch.completed_days, 1), 0) < _ch.duration THEN
    RAISE EXCEPTION 'challenge_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.xp_transactions
    WHERE user_id = _uid
      AND reason = 'challenge_complete'
      AND metadata->>'challenge_id' = _challenge_id::text
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true, 'xp', 0);
  END IF;

  _xp := public.award_xp(
    _uid,
    COALESCE(_ch.reward_xp, 0),
    'challenge_complete',
    jsonb_build_object('challenge_id', _challenge_id)
  );

  RETURN jsonb_build_object('ok', true, 'xp', _xp);
END;
$function$;
