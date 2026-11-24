-- Resolve a public referral code for the Friends feature without exposing
-- referral rows through the referrals table's owner-scoped RLS policy.
CREATE OR REPLACE FUNCTION public.lookup_friend_by_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm text := upper(btrim(coalesce(_code, '')));
  _target uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _norm !~ '^[A-Z0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  -- Prevent code-guessing abuse while allowing ordinary friend invitations.
  PERFORM public.rate_limit_check('lookup_friend_by_code', 3600, 30);

  SELECT r.referrer_id
    INTO _target
    FROM public.referrals AS r
   WHERE r.referral_code = _norm
     AND r.referred_id IS NULL
   ORDER BY r.created_at DESC
   LIMIT 1;

  RETURN _target;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_friend_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_friend_by_code(text) TO authenticated;
