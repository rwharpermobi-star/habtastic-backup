-- Separate friend identity codes from referral acquisition codes.
-- Existing public.referrals rows and referral_code values are intentionally untouched.

CREATE TABLE IF NOT EXISTS public.friend_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_codes_format CHECK (code ~ '^HAB-FRD-[A-F0-9]{6}$')
);

ALTER TABLE public.friend_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_codes FROM anon, authenticated;
GRANT SELECT ON public.friend_codes TO authenticated;
GRANT ALL ON public.friend_codes TO service_role;

DROP POLICY IF EXISTS friend_codes_select_own ON public.friend_codes;
CREATE POLICY friend_codes_select_own ON public.friend_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_friend_code_for(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _attempt integer := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;

  SELECT code INTO _code FROM public.friend_codes WHERE user_id = _user_id;
  IF _code IS NOT NULL THEN RETURN _code; END IF;

  LOOP
    _attempt := _attempt + 1;
    _code := 'HAB-FRD-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    BEGIN
      INSERT INTO public.friend_codes(user_id, code) VALUES (_user_id, _code)
      ON CONFLICT (user_id) DO NOTHING;
      SELECT code INTO _code FROM public.friend_codes WHERE user_id = _user_id;
      IF _code IS NOT NULL THEN RETURN _code; END IF;
    EXCEPTION WHEN unique_violation THEN
      IF _attempt >= 10 THEN RAISE; END IF;
    END;
    IF _attempt >= 10 THEN RAISE EXCEPTION 'friend_code_generation_failed'; END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_friend_code_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_friend_code_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_friend_code_after_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_friend_code_for(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_create_friend_code ON public.profiles;
CREATE TRIGGER profiles_create_friend_code
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_friend_code_after_profile_insert();

-- Backfill without changing any existing referral code or referral relationship.
DO $$
DECLARE _uid uuid;
BEGIN
  FOR _uid IN SELECT p.user_id FROM public.profiles p
  LOOP
    PERFORM public.ensure_friend_code_for(_uid);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_friend_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  RETURN public.ensure_friend_code_for(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_friend_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_friend_code() TO authenticated;

-- Friend lookup is now backed ONLY by friend_codes. Referral codes can never resolve here.
CREATE OR REPLACE FUNCTION public.lookup_friend_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm text := upper(btrim(coalesce(_code, '')));
  _target uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _norm !~ '^HAB-FRD-[A-F0-9]{6}$' THEN RETURN NULL; END IF;
  PERFORM public.rate_limit_check('lookup_friend_by_code', 3600, 30);
  SELECT user_id INTO _target FROM public.friend_codes WHERE code = _norm;
  RETURN _target;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_friend_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_friend_by_code(text) TO authenticated;

-- Normalize any historical duplicate/reversed pair rows before enforcing one
-- relationship record per pair. Accepted relationships win over pending/declined duplicates.
DELETE FROM public.friendships WHERE requester_id = addressee_id;
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id)
           ORDER BY (status = 'accepted') DESC, (status = 'pending') DESC, created_at DESC
         ) AS rn
  FROM public.friendships
)
DELETE FROM public.friendships f USING ranked r WHERE f.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS friendships_one_row_per_pair_idx
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.friendships'::regclass AND conname = 'friendships_no_self'
  ) THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id) NOT VALID;
  END IF;
  ALTER TABLE public.friendships VALIDATE CONSTRAINT friendships_no_self;
END;
$$;

-- Requests and friendship mutations are mediated by authenticated RPCs so a client
-- cannot accept another user's request or forge friendship state.
REVOKE INSERT, UPDATE, DELETE ON public.friendships FROM anon, authenticated;
GRANT SELECT ON public.friendships TO authenticated;

CREATE OR REPLACE FUNCTION public.send_friend_request(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _target uuid;
  _existing public.friendships;
  _allow boolean := true;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM public.rate_limit_check('send_friend_request', 3600, 20);
  SELECT user_id INTO _target FROM public.friend_codes WHERE code = upper(btrim(coalesce(_code, '')));
  IF _target IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'code_not_found'); END IF;
  IF _target = _uid THEN RETURN jsonb_build_object('ok', false, 'error', 'self_request'); END IF;

  SELECT COALESCE(pp.allow_friend_requests, true) INTO _allow
  FROM public.profile_privacy pp WHERE pp.user_id = _target;
  IF NOT COALESCE(_allow, true) THEN RETURN jsonb_build_object('ok', false, 'error', 'requests_disabled'); END IF;

  IF EXISTS (SELECT 1 FROM public.user_blocks b WHERE
      (b.blocker_id = _uid AND b.blocked_id = _target)
      OR (b.blocker_id = _target AND b.blocked_id = _uid)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_available');
  END IF;

  SELECT * INTO _existing FROM public.friendships f
  WHERE (f.requester_id = _uid AND f.addressee_id = _target)
     OR (f.requester_id = _target AND f.addressee_id = _uid)
  ORDER BY (f.status = 'accepted') DESC, f.created_at DESC
  LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    IF _existing.status = 'accepted' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_friends'); END IF;
    IF _existing.status = 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'error', CASE WHEN _existing.requester_id = _uid THEN 'request_pending' ELSE 'incoming_pending' END);
    END IF;
    IF _existing.status = 'declined' AND _existing.requester_id = _uid THEN
      UPDATE public.friendships SET status = 'pending', updated_at = now()
      WHERE id = _existing.id;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'previously_declined');
    END IF;
  ELSE
    INSERT INTO public.friendships(requester_id, addressee_id, status)
    VALUES (_uid, _target, 'pending');
  END IF;

  INSERT INTO public.notifications(user_id, kind, title, body, payload)
  VALUES (_target, 'friend_request', 'New friend request', 'Someone wants to connect with you on HabTastic.',
          jsonb_build_object('from_user_id', _uid, 'url', '/friends'));

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(_request_id uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row public.friendships;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.friendships
  SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END, updated_at = now()
  WHERE id = _request_id AND addressee_id = auth.uid() AND status = 'pending'
  RETURNING * INTO _row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'request_not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'status', _row.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.friendships
  WHERE id = _request_id AND requester_id = auth.uid() AND status = 'pending';
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(_other_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM public.friendships
  WHERE status = 'accepted'
    AND ((requester_id = auth.uid() AND addressee_id = _other_user_id)
      OR (requester_id = _other_user_id AND addressee_id = auth.uid()));
  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION public.send_friend_request(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_friend_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_friend_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
