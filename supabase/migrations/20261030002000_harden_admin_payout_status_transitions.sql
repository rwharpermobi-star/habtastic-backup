CREATE OR REPLACE FUNCTION public.admin_process_payout(_payout_id uuid, _status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _current_status text;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _status IS NULL OR _status NOT IN ('processing', 'paid', 'rejected', 'failed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT status INTO _current_status
  FROM public.payout_requests
  WHERE id = _payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF _current_status = _status THEN
    IF _status = 'paid' THEN
      RAISE EXCEPTION 'already_paid';
    END IF;
    RETURN true;
  END IF;

  IF NOT (
    (_current_status = 'pending' AND _status IN ('processing', 'rejected', 'failed'))
    OR (_current_status = 'processing' AND _status IN ('paid', 'rejected', 'failed'))
  ) THEN
    RAISE EXCEPTION 'invalid_transition';
  END IF;

  UPDATE public.payout_requests
  SET status = _status,
      processed_by = _uid,
      processed_at = now(),
      updated_at = now()
  WHERE id = _payout_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_payout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text) TO authenticated, service_role;
