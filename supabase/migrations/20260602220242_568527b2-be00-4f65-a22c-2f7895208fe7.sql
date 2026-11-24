-- Paystack webhook event log for idempotency, replay protection, and dev visibility
CREATE TABLE public.paystack_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_hash text NOT NULL UNIQUE,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'webhook',
  status text NOT NULL DEFAULT 'received',
  error_message text,
  user_id uuid,
  paystack_reference text,
  paystack_subscription_code text,
  payload_summary jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_paystack_events_received_at ON public.paystack_webhook_events (received_at DESC);
CREATE INDEX idx_paystack_events_user_id ON public.paystack_webhook_events (user_id);

GRANT SELECT ON public.paystack_webhook_events TO authenticated;
GRANT ALL ON public.paystack_webhook_events TO service_role;

ALTER TABLE public.paystack_webhook_events ENABLE ROW LEVEL SECURITY;

-- Users see only events tied to their own user_id; service role does the rest.
CREATE POLICY "Users read own paystack events"
  ON public.paystack_webhook_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages paystack events"
  ON public.paystack_webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);