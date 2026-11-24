-- Free tier limits:
--   * 4 habits for non-Premium users
--   * 5 Winston messages per UTC day for non-Premium users
--   * 1 active Money Saver goal for non-Premium users
-- Premium includes active paid Premium and the existing 5-day trial via user_is_premium().

CREATE OR REPLACE FUNCTION public.consume_ai_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used int;
  _reset date;
  _limit int := 5;
  _premium boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  _premium := public.user_is_premium(_uid);
  IF _premium THEN
    RETURN jsonb_build_object('allowed', true, 'unlimited', true, 'used', 0, 'limit', NULL);
  END IF;

  SELECT COALESCE(daily_ai_messages, 0), last_ai_reset
    INTO _used, _reset
    FROM public.profiles
   WHERE user_id = _uid
   FOR UPDATE;

  IF _used IS NULL THEN
    RAISE EXCEPTION 'profile_missing';
  END IF;

  IF _reset IS DISTINCT FROM _today THEN
    _used := 0;
  END IF;

  IF _used >= _limit THEN
    UPDATE public.profiles
       SET daily_ai_messages = _used,
           last_ai_reset = _today,
           updated_at = now()
     WHERE user_id = _uid;
    RETURN jsonb_build_object('allowed', false, 'unlimited', false, 'used', _used, 'limit', _limit);
  END IF;

  UPDATE public.profiles
     SET daily_ai_messages = _used + 1,
         last_ai_reset = _today,
         updated_at = now()
   WHERE user_id = _uid;

  RETURN jsonb_build_object('allowed', true, 'unlimited', false, 'used', _used + 1, 'limit', _limit);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_message() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_message() TO authenticated, service_role;

-- Enforce the 4-habit Free limit at the database boundary so clients cannot
-- bypass the limit by calling the table directly. Premium/trial users remain unlimited.
CREATE OR REPLACE FUNCTION public.enforce_free_habit_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  IF public.user_is_premium(NEW.user_id) THEN
    RETURN NEW;
  END IF;

  -- Serialize limit checks per user so two simultaneous inserts cannot both
  -- observe the same pre-insert count and exceed the Free cap.
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
$$;

DROP TRIGGER IF EXISTS enforce_free_habit_limit ON public.habits;
CREATE TRIGGER enforce_free_habit_limit
BEFORE INSERT ON public.habits
FOR EACH ROW
EXECUTE FUNCTION public.enforce_free_habit_limit();

REVOKE ALL ON FUNCTION public.enforce_free_habit_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_free_habit_limit() TO authenticated, service_role;

-- Enforce the Money Saver limit inside the authenticated RPC as well as in the
-- client. This keeps Winston/direct RPC calls from bypassing the Free limit.
CREATE OR REPLACE FUNCTION public.create_savings_goal(
  _name text,
  _target_amount numeric,
  _already_saved numeric,
  _target_date date,
  _currency text,
  _reason text default null,
  _regular_saving_amount numeric default null,
  _saving_frequency text default 'weekly'
)
RETURNS public.savings_goals
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_goal public.savings_goals;
  v_saved numeric := greatest(coalesce(_already_saved, 0), 0);
  v_existing integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _target_amount IS NULL OR _target_amount <= 0 THEN RAISE EXCEPTION 'target_amount_must_be_positive'; END IF;
  IF _target_date IS NULL THEN RAISE EXCEPTION 'target_date_required'; END IF;
  IF upper(coalesce(_currency,'')) !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'invalid_currency'; END IF;

  IF NOT public.user_is_premium(v_user) THEN
    -- Same concurrency guard as habits: the count and insert must act as one
    -- serialized decision for each user.
    PERFORM pg_advisory_xact_lock(hashtext('money-saver-limit:' || v_user::text));

    SELECT count(*)::integer
      INTO v_existing
      FROM public.savings_goals
     WHERE user_id = v_user
       AND status = 'active';

    IF v_existing >= 1 THEN
      RAISE EXCEPTION 'free_money_saver_limit_reached'
        USING ERRCODE = 'P0001',
              HINT = 'Free accounts can have 1 active Money Saver goal. Upgrade to Premium for unlimited savings goals.';
    END IF;
  END IF;

  INSERT INTO public.savings_goals (
    user_id, name, target_amount, starting_amount, current_amount,
    target_date, currency, reason, regular_saving_amount, saving_frequency
  ) VALUES (
    v_user, trim(_name), _target_amount, v_saved, 0,
    _target_date, upper(_currency), nullif(trim(coalesce(_reason,'')), ''),
    _regular_saving_amount,
    CASE WHEN _saving_frequency IN ('daily','weekly','monthly') THEN _saving_frequency ELSE 'weekly' END
  ) RETURNING * INTO v_goal;

  IF v_saved > 0 THEN
    INSERT INTO public.savings_entries(user_id, goal_id, amount, source, note)
    VALUES (v_user, v_goal.id, v_saved, 'initial', 'Starting savings');
  END IF;

  SELECT * INTO v_goal FROM public.savings_goals WHERE id = v_goal.id AND user_id = v_user;
  RETURN v_goal;
END;
$$;

REVOKE ALL ON FUNCTION public.create_savings_goal(text,numeric,numeric,date,text,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_savings_goal(text,numeric,numeric,date,text,text,numeric,text) TO authenticated;
