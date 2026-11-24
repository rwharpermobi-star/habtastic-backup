DO $$
DECLARE
  view_name text;
BEGIN
  FOR view_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
      AND (
        c.relname ILIKE 'admin_%'
        OR c.relname IN (
          'community_dau',
          'community_feed_engagement',
          'community_challenge_stats',
          'facebook_conversion_stats',
          'community_top_members'
        )
      )
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', view_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', view_name);
  END LOOP;
END
$$;

REVOKE ALL ON TABLE public.paystack_webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.paystack_webhook_events TO service_role;
ALTER TABLE public.paystack_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own webhook events" ON public.paystack_webhook_events;
DROP POLICY IF EXISTS "Users can view own webhook events" ON public.paystack_webhook_events;
DROP POLICY IF EXISTS "Authenticated users can read webhook events" ON public.paystack_webhook_events;

REVOKE ALL ON TABLE public.paystack_webhook_events_safe FROM anon;
REVOKE ALL ON TABLE public.paystack_webhook_events_safe FROM authenticated;
GRANT SELECT ON TABLE public.paystack_webhook_events_safe TO authenticated;
GRANT ALL ON TABLE public.paystack_webhook_events_safe TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'graphql' AND p.proname = 'resolve'
  ) THEN
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA graphql TO service_role;
  END IF;
END
$$;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
GRANT USAGE ON SCHEMA graphql, graphql_public TO service_role;