-- Drop old Paddle subscriptions table
DROP TABLE IF EXISTS public.subscriptions CASCADE;

-- Recreate for Paystack
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  paystack_customer_code text,
  paystack_customer_id bigint,
  paystack_subscription_code text UNIQUE,
  paystack_subscription_id bigint,
  email_token text,
  plan_code text NOT NULL,
  plan_interval text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  amount integer,
  currency text DEFAULT 'USD',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_payment_date timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamptz,
  environment text NOT NULL DEFAULT 'test',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subs_user ON public.subscriptions(user_id);
CREATE INDEX idx_subs_paystack_sub ON public.subscriptions(paystack_subscription_code);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER subs_touch_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Update helper to recognise Paystack-style statuses
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'test')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND (
        (status IN ('active','trialing','non-renewing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'attention' AND current_period_end > now())
      )
  );
$$;