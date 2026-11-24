
ALTER TABLE public.paystack_webhook_events
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.paystack_webhook_events
  SET idempotency_key = event_hash
  WHERE idempotency_key IS NULL;

CREATE TABLE IF NOT EXISTS public.paystack_subscription_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_id uuid REFERENCES public.paystack_webhook_events(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  changed_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paystack_subscription_audit TO authenticated;
GRANT ALL ON public.paystack_subscription_audit TO service_role;

ALTER TABLE public.paystack_subscription_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription audit"
  ON public.paystack_subscription_audit
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscription audit"
  ON public.paystack_subscription_audit
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pwh_events_user_received
  ON public.paystack_webhook_events (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_psa_user_created
  ON public.paystack_subscription_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_psa_event
  ON public.paystack_subscription_audit (event_id);
