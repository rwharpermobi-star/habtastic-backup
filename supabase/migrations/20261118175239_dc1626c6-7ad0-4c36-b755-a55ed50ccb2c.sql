CREATE OR REPLACE FUNCTION public.guard_challenge_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  _start date;
  _d text;
  _day date;
  _seen date[] := '{}';
BEGIN
  -- Only client API roles are restricted; server-side jobs run as other roles.
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.duration IS NULL OR NEW.duration NOT IN (7, 30) THEN
      RAISE EXCEPTION 'invalid_challenge_duration' USING ERRCODE = '22023';
    END IF;
    IF NEW.start_date IS NULL OR NEW.start_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'invalid_challenge_start' USING ERRCODE = '22023';
    END IF;
    _start := NEW.start_date::date;
    IF _start NOT BETWEEN current_date - 1 AND current_date + 1 THEN
      RAISE EXCEPTION 'invalid_challenge_start' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(array_length(NEW.completed_days, 1), 0) > 0 THEN
      RAISE EXCEPTION 'invalid_completed_days' USING ERRCODE = '22023';
    END IF;
    NEW.reward_xp := public.challenge_reward_xp(NEW.duration);
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.duration IS DISTINCT FROM OLD.duration
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.reward_xp IS DISTINCT FROM OLD.reward_xp
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'challenge_fields_locked' USING ERRCODE = '42501';
  END IF;

  IF NEW.completed_days IS DISTINCT FROM OLD.completed_days THEN
    IF NOT (COALESCE(OLD.completed_days, '{}') <@ COALESCE(NEW.completed_days, '{}')) THEN
      RAISE EXCEPTION 'invalid_completed_days' USING ERRCODE = '22023';
    END IF;
    IF OLD.start_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'invalid_challenge_start' USING ERRCODE = '22023';
    END IF;
    _start := OLD.start_date::date;
    FOREACH _d IN ARRAY COALESCE(NEW.completed_days, '{}') LOOP
      IF _d IS NULL OR _d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'invalid_completed_days' USING ERRCODE = '22023';
      END IF;
      _day := _d::date;
      IF _day < _start OR _day > current_date + 1 OR _day > _start + NEW.duration - 1 OR _day = ANY(_seen) THEN
        RAISE EXCEPTION 'invalid_completed_days' USING ERRCODE = '22023';
      END IF;
      _seen := _seen || _day;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_challenge_fields() FROM PUBLIC, anon, authenticated;