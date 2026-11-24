-- 1. Webhook event retry + dedupe metadata -----------------------------------
ALTER TABLE public.paystack_webhook_events
  ADD COLUMN IF NOT EXISTS event_hash text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS payload_summary jsonb,
  ADD COLUMN IF NOT EXISTS paystack_reference text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS shop_order_id uuid,
  ADD COLUMN IF NOT EXISTS subscription_id uuid;

UPDATE public.paystack_webhook_events
   SET event_hash = COALESCE(event_hash, idempotency_key, id::text)
 WHERE event_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS paystack_webhook_events_event_hash_uidx
  ON public.paystack_webhook_events(event_hash);

CREATE INDEX IF NOT EXISTS paystack_webhook_events_retry_idx
  ON public.paystack_webhook_events(status, next_retry_at);

-- 2. Subscription fields written by the Paystack processor --------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paystack_customer_code text,
  ADD COLUMN IF NOT EXISTS paystack_customer_id bigint,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code text,
  ADD COLUMN IF NOT EXISTS paystack_subscription_id bigint,
  ADD COLUMN IF NOT EXISTS email_token text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS environment text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paystack_subscription_code_uidx
  ON public.subscriptions(paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_paystack_customer_code_idx
  ON public.subscriptions(paystack_customer_code);

-- 3. Redacted admin/user view -------------------------------------------------
DROP VIEW IF EXISTS public.paystack_webhook_events_safe;
CREATE VIEW public.paystack_webhook_events_safe AS
  SELECT id, user_id, event_type, source, status, error_message,
         received_at, processed_at, idempotency_key,
         event_hash, attempts, duplicate_count, last_attempt_at, next_retry_at,
         paystack_reference, paystack_subscription_code,
         shop_order_id, subscription_id
    FROM public.paystack_webhook_events;

REVOKE ALL ON public.paystack_webhook_events_safe FROM anon, authenticated;
GRANT SELECT ON public.paystack_webhook_events_safe TO service_role;

-- 4. Listing RPC (own events, or everything for admins) ----------------------
DROP FUNCTION IF EXISTS public.list_paystack_webhook_events(integer);
CREATE FUNCTION public.list_paystack_webhook_events(_limit integer DEFAULT 100)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  event_type text,
  source text,
  status text,
  error_message text,
  received_at timestamptz,
  processed_at timestamptz,
  idempotency_key text,
  event_hash text,
  attempts integer,
  duplicate_count integer,
  is_duplicate boolean,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  paystack_reference text,
  paystack_subscription_code text,
  shop_order_id uuid,
  subscription_id uuid
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
         v.received_at, v.processed_at, v.idempotency_key,
         v.event_hash, v.attempts, v.duplicate_count,
         (v.duplicate_count > 0) AS is_duplicate,
         v.last_attempt_at, v.next_retry_at,
         v.paystack_reference, v.paystack_subscription_code,
         v.shop_order_id, v.subscription_id
  FROM public.paystack_webhook_events_safe v
  WHERE _is_admin OR v.user_id = _uid
  ORDER BY v.received_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 200));
END $$;

REVOKE ALL ON FUNCTION public.list_paystack_webhook_events(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_paystack_webhook_events(integer) TO authenticated, service_role;

-- 5. Retry queue helper (service_role only) ----------------------------------
CREATE OR REPLACE FUNCTION public.paystack_events_due_for_retry(
  _limit integer DEFAULT 25,
  _max_attempts integer DEFAULT 6
)
RETURNS TABLE(id uuid, event_hash text, event_type text, attempts integer, raw_payload jsonb, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.event_hash, e.event_type, e.attempts, e.raw_payload, e.user_id
  FROM public.paystack_webhook_events e
  WHERE e.status IN ('failed', 'received')
    AND e.raw_payload IS NOT NULL
    AND COALESCE(e.attempts, 0) < GREATEST(1, COALESCE(_max_attempts, 6))
    AND (e.next_retry_at IS NULL OR e.next_retry_at <= now())
  ORDER BY e.received_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 25), 100));
$$;

REVOKE ALL ON FUNCTION public.paystack_events_due_for_retry(integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.paystack_events_due_for_retry(integer, integer) TO service_role;