GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;