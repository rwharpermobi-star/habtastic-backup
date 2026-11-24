-- Harden the existing friend_challenges table instead of creating a parallel
-- challenge system. Challenge writes and progress are server-authoritative.

ALTER TABLE public.friend_challenges
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

REVOKE INSERT, UPDATE, DELETE ON public.friend_challenges FROM anon, authenticated;
GRANT SELECT ON public.friend_challenges TO authenticated;
GRANT ALL ON public.friend_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.create_friend_habit_challenge(
  _friend_id uuid,
  _title text,
  _duration_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _code text;
  _attempt integer := 0;
  _clean_title text := left(btrim(coalesce(_title, '')), 80);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _friend_id IS NULL OR _friend_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_friend');
  END IF;
  IF _clean_title = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'title_required'); END IF;
  IF _duration_days IS NULL OR _duration_days < 1 OR _duration_days > 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = _friend_id)
        OR (f.requester_id = _friend_id AND f.addressee_id = auth.uid()))
  ) THEN RETURN jsonb_build_object('ok', false, 'error', 'not_friends'); END IF;

  PERFORM public.rate_limit_check('create_friend_habit_challenge', 3600, 10);
  LOOP
    _attempt := _attempt + 1;
    _code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6));
    BEGIN
      INSERT INTO public.friend_challenges
        (creator_id, opponent_id, code, habit_name, duration_days, start_date, status, creator_progress, opponent_progress)
      VALUES
        (auth.uid(), _friend_id, _code, _clean_title, _duration_days, current_date, 'pending', 0, 0)
      RETURNING id INTO _id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF _attempt >= 10 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.notifications(user_id, kind, title, body, payload)
  VALUES (_friend_id, 'friend_challenge', 'New habit challenge', 'A friend has challenged you on HabTastic.',
    jsonb_build_object('challenge_id', _id, 'url', '/friends'));

  RETURN jsonb_build_object('ok', true, 'challenge_id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_habit_challenge(_challenge_id uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.friend_challenges;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.friend_challenges
  SET status = CASE WHEN _accept THEN 'active' ELSE 'declined' END,
      start_date = CASE WHEN _accept THEN current_date ELSE start_date END,
      updated_at = now()
  WHERE id = _challenge_id AND opponent_id = auth.uid() AND status = 'pending'
  RETURNING * INTO _row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'challenge_not_found'); END IF;
  INSERT INTO public.notifications(user_id, kind, title, body, payload)
  VALUES (_row.creator_id,
    CASE WHEN _accept THEN 'friend_challenge_accepted' ELSE 'friend_challenge_declined' END,
    CASE WHEN _accept THEN 'Challenge accepted' ELSE 'Challenge declined' END,
    CASE WHEN _accept THEN 'Your friend accepted the habit challenge.' ELSE 'Your friend declined the habit challenge.' END,
    jsonb_build_object('challenge_id', _row.id, 'url', '/friends'));
  RETURN jsonb_build_object('ok', true, 'status', _row.status);
END;
$$;

-- Keep the existing share-by-code entry point, but only accepted friends may join.
CREATE OR REPLACE FUNCTION public.create_friend_challenge_code(_message text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _code text; _attempt integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM public.rate_limit_check('create_friend_challenge_code', 3600, 10);
  LOOP
    _attempt := _attempt + 1;
    _code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6));
    BEGIN
      INSERT INTO public.friend_challenges
        (creator_id, code, habit_name, duration_days, start_date, status, creator_progress, opponent_progress)
      VALUES
        (auth.uid(), _code, left(btrim(coalesce(_message, 'Weekly Challenge')), 80), 7, current_date, 'pending', 0, 0);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _attempt >= 10 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_friend_challenge(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _creator uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT id, creator_id INTO _id, _creator
  FROM public.friend_challenges
  WHERE code = upper(btrim(coalesce(_code, '')))
    AND opponent_id IS NULL
    AND creator_id <> auth.uid()
    AND status = 'pending'
  LIMIT 1
  FOR UPDATE;
  IF _id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'challenge_not_found'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = _creator)
        OR (f.requester_id = _creator AND f.addressee_id = auth.uid()))
  ) THEN RETURN jsonb_build_object('ok', false, 'error', 'not_friends'); END IF;

  UPDATE public.friend_challenges
  SET opponent_id = auth.uid(), status = 'active', start_date = current_date, updated_at = now()
  WHERE id = _id AND opponent_id IS NULL AND status = 'pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'challenge_unavailable'); END IF;
  RETURN jsonb_build_object('ok', true, 'challenge_id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_my_friend_habit_challenges()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _updated integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  WITH progress AS (
    SELECT
      c.id,
      (SELECT count(DISTINCT comp.completion::date)::integer
       FROM public.habits h
       CROSS JOIN LATERAL unnest(h.completions) AS comp(completion)
       WHERE h.user_id = c.creator_id
         AND comp.completion ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         AND comp.completion::date BETWEEN c.start_date AND c.start_date + c.duration_days - 1) AS creator_done,
      (SELECT count(DISTINCT comp.completion::date)::integer
       FROM public.habits h
       CROSS JOIN LATERAL unnest(h.completions) AS comp(completion)
       WHERE h.user_id = c.opponent_id
         AND comp.completion ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         AND comp.completion::date BETWEEN c.start_date AND c.start_date + c.duration_days - 1) AS opponent_done
    FROM public.friend_challenges c
    WHERE c.status = 'active' AND c.opponent_id IS NOT NULL
      AND (c.creator_id = auth.uid() OR c.opponent_id = auth.uid())
  )
  UPDATE public.friend_challenges c
  SET creator_progress = LEAST(c.duration_days, progress.creator_done),
      opponent_progress = LEAST(c.duration_days, progress.opponent_done),
      status = CASE
        WHEN progress.creator_done >= c.duration_days AND progress.opponent_done >= c.duration_days THEN 'completed'
        WHEN current_date > c.start_date + c.duration_days - 1 THEN 'expired'
        ELSE 'active'
      END,
      completed_at = CASE
        WHEN progress.creator_done >= c.duration_days AND progress.opponent_done >= c.duration_days
          THEN COALESCE(c.completed_at, now())
        ELSE c.completed_at
      END,
      updated_at = now()
  FROM progress
  WHERE c.id = progress.id;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', _updated);
END;
$$;

REVOKE ALL ON FUNCTION public.create_friend_habit_challenge(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_friend_habit_challenge(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_friend_challenge_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_friend_challenge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_my_friend_habit_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_friend_habit_challenge(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_habit_challenge(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_friend_challenge_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_challenge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_my_friend_habit_challenges() TO authenticated;
