-- Google Play provider purchase tokens are globally unique per provider.
-- This gives RTDN processing an idempotent server-side upsert key.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_token_uidx
  ON public.subscriptions(provider, provider_subscription_code);
