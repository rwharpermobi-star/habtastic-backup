-- 1) Remove legacy blanket grants to anon on all public tables/views
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

-- 2) Re-grant only the anonymous write paths the app actually needs
GRANT INSERT ON public.client_telemetry_events TO anon;
GRANT INSERT ON public.community_clicks TO anon;

-- 3) Internal-only tables: no signed-in user access at all
REVOKE ALL ON public.paystack_webhook_events FROM authenticated;
REVOKE ALL ON public.rate_limits_ip FROM authenticated;
GRANT ALL ON public.paystack_webhook_events TO service_role;
GRANT ALL ON public.rate_limits_ip TO service_role;

-- 4) Replace permissive WITH CHECK (true) insert policies
DROP POLICY IF EXISTS cte_insert ON public.client_telemetry_events;
CREATE POLICY cte_insert ON public.client_telemetry_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS clicks_insert ON public.community_clicks;
CREATE POLICY clicks_insert ON public.community_clicks
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND destination IS NOT NULL
    AND length(destination) BETWEEN 1 AND 200
  );