-- Restore the atomic Paystack Premium grant RPC against the live premium_grants schema.
-- The table's legacy reason/days columns have defaults; all payment identity and
-- entitlement fields used here exist in production. Unique event/reference indexes
-- provide idempotency, and the profile entitlement update shares this transaction.
CREATE OR REPLACE FUNCTION public.apply_paystack_premium_grant(
  _user_id uuid,
  _event_id text,
  _reference text,
  _kind text,
  _premium_until timestamptz,
  _amount integer,
  _currency text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows integer;
  updated_rows integer;
  existing_user_id uuid;
  existing_kind text;
  existing_premium_until timestamptz;
BEGIN
  IF _user_id IS NULL OR _kind IS NULL OR length(_kind) = 0 THEN
    RAISE EXCEPTION 'Invalid Premium grant identity';
  END IF;
  IF _event_id IS NULL AND _reference IS NULL THEN
    RAISE EXCEPTION 'Premium grant requires an event ID or payment reference';
  END IF;

  INSERT INTO public.premium_grants (
    user_id, paystack_event_id, paystack_reference, kind,
    premium_until, amount, currency, metadata
  )
  VALUES (
    _user_id, _event_id, _reference, _kind,
    _premium_until, _amount, _currency,
    jsonb_build_object('source', 'paystack_atomic_grant')
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  IF inserted_rows = 0 THEN
    SELECT user_id, kind, premium_until
      INTO existing_user_id, existing_kind, existing_premium_until
    FROM public.premium_grants
    WHERE (_event_id IS NOT NULL AND paystack_event_id = _event_id)
       OR (_reference IS NOT NULL AND paystack_reference = _reference AND kind = _kind)
    ORDER BY CASE WHEN _event_id IS NOT NULL AND paystack_event_id = _event_id THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Premium grant conflict could not be resolved safely';
    END IF;
    IF existing_user_id IS DISTINCT FROM _user_id OR existing_kind IS DISTINCT FROM _kind THEN
      RAISE EXCEPTION 'Premium grant idempotency key belongs to a different grant';
    END IF;

    UPDATE public.profiles
    SET is_premium = true,
        premium_until = existing_premium_until,
        updated_at = now()
    WHERE user_id = existing_user_id;

    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    IF updated_rows = 0 THEN
      RAISE EXCEPTION 'Cannot repair Premium profile: profile not found for user %', existing_user_id;
    END IF;
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET is_premium = true,
      premium_until = _premium_until,
      updated_at = now()
  WHERE user_id = _user_id;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows = 0 THEN
    RAISE EXCEPTION 'Cannot grant Premium: profile not found for user %', _user_id;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_paystack_premium_grant(uuid, text, text, text, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paystack_premium_grant(uuid, text, text, text, timestamptz, integer, text) TO service_role;
