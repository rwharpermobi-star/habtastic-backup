-- 1) Friend challenges: access ends when the friendship ends
CREATE INDEX IF NOT EXISTS friendships_requester_addressee_idx ON public.friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_requester_idx ON public.friendships (addressee_id, requester_id);

DROP POLICY IF EXISTS fc_view ON public.friend_challenges;
CREATE POLICY fc_view ON public.friend_challenges
FOR SELECT TO authenticated
USING (
  ((SELECT auth.uid()) = creator_id AND opponent_id IS NULL)
  OR (
    ((SELECT auth.uid()) = creator_id OR (SELECT auth.uid()) = opponent_id)
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.requester_id = friend_challenges.creator_id AND f.addressee_id = friend_challenges.opponent_id)
          OR (f.requester_id = friend_challenges.opponent_id AND f.addressee_id = friend_challenges.creator_id))
    )
  )
);

-- 2) Accountability partners: no self-acceptance
DROP POLICY IF EXISTS ap_update ON public.accountability_partners;
DROP POLICY IF EXISTS ap_insert ON public.accountability_partners;
CREATE POLICY ap_insert ON public.accountability_partners
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = requester_id
  AND partner_id <> requester_id
  AND status = 'pending'
  AND ended_at IS NULL
);

CREATE OR REPLACE FUNCTION public.respond_partner_request(_partnership_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  UPDATE public.accountability_partners
  SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END, updated_at = now()
  WHERE id = _partnership_id AND partner_id = auth.uid() AND status = 'pending';
  RETURN jsonb_build_object('ok', FOUND);
END $$;

CREATE OR REPLACE FUNCTION public.end_partnership(_partnership_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  UPDATE public.accountability_partners
  SET status = 'ended', ended_at = now(), updated_at = now()
  WHERE id = _partnership_id
    AND status IN ('pending', 'accepted')
    AND (requester_id = auth.uid() OR partner_id = auth.uid());
  RETURN jsonb_build_object('ok', FOUND);
END $$;
REVOKE EXECUTE ON FUNCTION public.end_partnership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_partnership(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.respond_partner_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_partner_request(uuid, boolean) TO authenticated, service_role;

-- 3) Personal challenges: reward and progress derived from server state
CREATE OR REPLACE FUNCTION public.challenge_reward_xp(_duration integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT CASE _duration WHEN 7 THEN 100 WHEN 30 THEN 500 ELSE 0 END $$;

CREATE OR REPLACE FUNCTION public.guard_challenge_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  _start date;
  _d text;
  _day date;
  _seen date[] := '{}';
BEGIN
  IF public.is_service_caller() THEN RETURN NEW; END IF;

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

DROP TRIGGER IF EXISTS guard_challenge_fields ON public.challenges;
CREATE TRIGGER guard_challenge_fields
BEFORE INSERT OR UPDATE ON public.challenges
FOR EACH ROW EXECUTE FUNCTION public.guard_challenge_fields();

CREATE OR REPLACE FUNCTION public.complete_user_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ch public.challenges;
  _start date;
  _done int := 0;
  _xp int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT public.user_is_premium(_uid) THEN
    RAISE EXCEPTION 'premium_challenge_locked'
      USING ERRCODE = 'P0001',
            HINT = 'Your challenge progress is saved. Activate Premium to claim or continue it.';
  END IF;

  SELECT * INTO _ch FROM public.challenges
  WHERE id = _challenge_id AND user_id = _uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF _ch.start_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'challenge_incomplete'; END IF;
  _start := _ch.start_date::date;

  SELECT count(DISTINCT d::date) INTO _done
  FROM unnest(COALESCE(_ch.completed_days, '{}')) AS d
  WHERE d ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND d::date BETWEEN _start AND LEAST(_start + _ch.duration - 1, current_date + 1);

  IF _done < _ch.duration OR _ch.created_at > now() - make_interval(days => _ch.duration - 2) THEN
    RAISE EXCEPTION 'challenge_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.xp_transactions
    WHERE user_id = _uid AND reason = 'challenge_complete'
      AND metadata->>'challenge_id' = _challenge_id::text
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true, 'xp', 0);
  END IF;

  _xp := public.award_xp(_uid, public.challenge_reward_xp(_ch.duration), 'challenge_complete',
                         jsonb_build_object('challenge_id', _challenge_id));
  RETURN jsonb_build_object('ok', true, 'xp', _xp);
END $$;

-- 4) equip_cosmetic: fixed slot statements, no dynamic SQL
CREATE OR REPLACE FUNCTION public.equip_cosmetic(_item_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _cat text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'Item not owned';
  END IF;
  SELECT category INTO _cat FROM public.cosmetic_items WHERE id = _item_id;

  INSERT INTO public.user_equipped_cosmetics(user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;

  CASE _cat
    WHEN 'theme'  THEN UPDATE public.user_equipped_cosmetics SET theme  = _item_id, updated_at = now() WHERE user_id = _uid;
    WHEN 'frame'  THEN UPDATE public.user_equipped_cosmetics SET frame  = _item_id, updated_at = now() WHERE user_id = _uid;
    WHEN 'crown'  THEN UPDATE public.user_equipped_cosmetics SET crown  = _item_id, updated_at = now() WHERE user_id = _uid;
    WHEN 'effect' THEN UPDATE public.user_equipped_cosmetics SET effect = _item_id, updated_at = now() WHERE user_id = _uid;
    WHEN 'emote'  THEN UPDATE public.user_equipped_cosmetics SET emote  = _item_id, updated_at = now() WHERE user_id = _uid;
    ELSE RAISE EXCEPTION 'Invalid category';
  END CASE;
END $$;
REVOKE EXECUTE ON FUNCTION public.equip_cosmetic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic(text) TO authenticated, service_role;