CREATE OR REPLACE FUNCTION public.request_payout(_amount_cents integer, _bank_masked text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 OR _amount_cents > 100000000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF _bank_masked IS NULL OR length(btrim(_bank_masked)) < 4 OR length(btrim(_bank_masked)) > 80 THEN
    RAISE EXCEPTION 'invalid_bank_account_mask';
  END IF;

  INSERT INTO public.payout_requests(user_id, amount_cents, bank_account_masked)
  VALUES (_uid, _amount_cents, btrim(_bank_masked))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(integer, text) TO authenticated, service_role;
