CREATE INDEX IF NOT EXISTS idx_winston_memory_user_weight
  ON public.winston_memory (user_id, weight DESC);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON public.notification_prefs (user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);