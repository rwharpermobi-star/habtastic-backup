DROP FUNCTION IF EXISTS public.admin_list_paystack_webhook_events(integer);

CREATE OR REPLACE FUNCTION public.list_paystack_webhook_events(_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  event_type text,
  source text,
  status text,
  error_message text,
  received_at timestamptz,
  processed_at timestamptz,
  idempotency_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _is_admin boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  _is_admin := public.has_role(_uid, 'admin');

  RETURN QUERY
  SELECT v.id, v.user_id, v.event_type, v.source, v.status, v.error_message,
         v.received_at, v.processed_at, v.idempotency_key
  FROM public.paystack_webhook_events_safe v
  WHERE _is_admin OR v.user_id = _uid
  ORDER BY v.received_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 200));
END $$;

REVOKE ALL ON FUNCTION public.list_paystack_webhook_events(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.list_paystack_webhook_events(integer) TO authenticated;
