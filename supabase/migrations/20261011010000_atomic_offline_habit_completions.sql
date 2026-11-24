-- Fix #3 additive migration: date-scoped and revision-guarded habit completion.
-- Review and deploy this SQL BEFORE shipping the client; never run on live DB automatically.
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS completion_revision bigint NOT NULL DEFAULT 0;

-- Client inserts must not choose their own starting revision.
CREATE OR REPLACE FUNCTION public.initialize_habit_completion_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.completion_revision := 0;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS initialize_habit_completion_revision ON public.habits;
CREATE TRIGGER initialize_habit_completion_revision BEFORE INSERT ON public.habits
FOR EACH ROW EXECUTE FUNCTION public.initialize_habit_completion_revision();
REVOKE ALL ON FUNCTION public.initialize_habit_completion_revision() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_habit_completion_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.completions IS DISTINCT FROM OLD.completions THEN
    NEW.completion_revision := OLD.completion_revision + 1;
  ELSE
    NEW.completion_revision := OLD.completion_revision;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bump_habit_completion_revision ON public.habits;
CREATE TRIGGER bump_habit_completion_revision BEFORE UPDATE ON public.habits
FOR EACH ROW EXECUTE FUNCTION public.bump_habit_completion_revision();
REVOKE ALL ON FUNCTION public.bump_habit_completion_revision() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.habit_completion_operations (
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  completed boolean NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
ALTER TABLE public.habit_completion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.habit_completion_operations FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.habit_completion_reward_claims (
  user_id uuid NOT NULL,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, habit_id, local_date)
);
ALTER TABLE public.habit_completion_reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.habit_completion_reward_claims FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_habit_completion(
  _habit_id uuid, _local_date date, _completed boolean,
  _expected_revision bigint, _event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _utc_day date := (now() AT TIME ZONE 'UTC')::date;
  _habit public.habits%ROWTYPE;
  _prior public.habit_completion_operations%ROWTYPE;
  _day_text text;
  _was_done boolean;
  _revision bigint;
  _xp integer := 0;
  _coins integer := 0;
  _base_xp integer;
  _base_coins integer;
  _inserted integer;
  _prior_xp integer := 0;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _habit_id IS NULL OR _local_date IS NULL OR _completed IS NULL OR _event_id IS NULL THEN
    RAISE EXCEPTION 'invalid_completion_event' USING ERRCODE = '22023';
  END IF;
  IF _expected_revision IS NULL OR _expected_revision < 0 THEN
    RAISE EXCEPTION 'habit_revision_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('offline-completion:' || _uid::text));
  SELECT * INTO _prior FROM public.habit_completion_operations
  WHERE user_id = _uid AND event_id = _event_id;
  IF FOUND THEN
    IF _prior.habit_id <> _habit_id OR _prior.local_date <> _local_date
       OR _prior.completed IS DISTINCT FROM _completed THEN
      RAISE EXCEPTION 'completion_event_reused' USING ERRCODE = '22023';
    END IF;
    RETURN _prior.result;
  END IF;

  -- A local timezone can be a UTC day ahead. Offline rewards can be up to
  -- two UTC dates behind; older or future events are rejected, not discarded.
  IF _local_date < _utc_day - 2 OR _local_date > _utc_day + 1 THEN
    RAISE EXCEPTION 'offline_date_out_of_range' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _habit FROM public.habits
  WHERE id = _habit_id AND user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'habit_not_found' USING ERRCODE = 'P0002'; END IF;
  -- Explicitly enforce the existing Free-tier lock even on no-op events.
  -- Without this, an already completed locked habit could still claim XP
  -- because the BEFORE UPDATE trigger would never fire.
  IF NOT COALESCE(public.user_is_premium(_uid), false) AND NOT EXISTS (
    SELECT 1 FROM (
      SELECT id FROM public.habits
      WHERE user_id = _uid
      ORDER BY created_at ASC, id ASC
      LIMIT 4
    ) AS active_free_habits WHERE active_free_habits.id = _habit_id
  ) THEN
    RAISE EXCEPTION 'free_habit_locked' USING ERRCODE = 'P0001';
  END IF;
  IF _habit.completion_revision <> _expected_revision THEN
    RAISE EXCEPTION 'completion_revision_conflict' USING ERRCODE = '40001';
  END IF;

  _day_text := _local_date::text;
  _was_done := _day_text = ANY(COALESCE(_habit.completions, '{}'::text[]));
  IF _was_done IS DISTINCT FROM _completed THEN
    UPDATE public.habits SET completions =
      CASE WHEN _completed
        THEN array_append(COALESCE(_habit.completions, '{}'::text[]), _day_text)
        ELSE array_remove(COALESCE(_habit.completions, '{}'::text[]), _day_text)
      END
    WHERE id = _habit_id AND user_id = _uid
    RETURNING completion_revision INTO _revision;
  ELSE
    _revision := _habit.completion_revision;
  END IF;

  _base_xp := CASE _habit.difficulty WHEN 'easy' THEN 5 WHEN 'hard' THEN 20 ELSE 10 END;
  _base_coins := CASE _habit.difficulty WHEN 'easy' THEN 3 WHEN 'hard' THEN 10 ELSE 5 END;
  IF _completed THEN
    INSERT INTO public.habit_completion_reward_claims(user_id,habit_id,local_date)
    VALUES (_uid,_habit_id,_local_date)
    ON CONFLICT (user_id,habit_id,local_date) DO NOTHING;
    GET DIAGNOSTICS _inserted = ROW_COUNT;
    IF _inserted > 0 THEN
      _xp := public.award_xp(_uid,_base_xp,'habit_complete',
        jsonb_build_object('habit_id',_habit_id::text,'date',_day_text,
          'claim_key',_habit_id::text || ':' || _day_text,
          'source','apply_habit_completion'));
      _coins := public.award_coins(_uid,_base_coins,'habit_complete',
        jsonb_build_object('habit_id',_habit_id::text,'date',_day_text,
          'source','apply_habit_completion'));
      INSERT INTO public.reward_eligibility(user_id,kind,source_key)
      VALUES (_uid,'surprise_roll',_habit_id::text || ':' || _day_text)
      ON CONFLICT (user_id,kind,source_key) DO NOTHING;
      UPDATE public.habit_completion_reward_claims SET xp_awarded = _xp
      WHERE user_id = _uid AND habit_id = _habit_id AND local_date = _local_date;
    END IF;
  ELSIF _was_done THEN
    SELECT xp_awarded INTO _prior_xp FROM public.habit_completion_reward_claims
    WHERE user_id = _uid AND habit_id = _habit_id AND local_date = _local_date;
    IF _prior_xp > 0 THEN
      -- The legacy XP unique index uses metadata.date. completed_date lets
      -- the existing undo deduper find this day without colliding with
      -- the positive habit_complete ledger entry.
      _xp := public.award_xp(_uid,-_prior_xp,'habit_undo',
        jsonb_build_object('habit_id',_habit_id::text,
          'completed_date',_day_text,'source','apply_habit_completion'));
    END IF;
  END IF;
  _result := jsonb_build_object('ok',true,'revision',_revision,
                                 'xp',_xp,'coins',_coins,'date',_day_text);
  INSERT INTO public.habit_completion_operations
    (user_id,event_id,habit_id,local_date,completed,result)
  VALUES (_uid,_event_id,_habit_id,_local_date,_completed,_result);
  RETURN _result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_habit_completion(uuid,date,boolean,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_habit_completion(uuid,date,boolean,bigint,uuid) TO authenticated, service_role;
