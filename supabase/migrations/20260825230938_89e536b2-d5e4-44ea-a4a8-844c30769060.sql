-- 1) Revoke anon SELECT on every public table/view except the intentional public catalogs
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','f','p')
      AND c.relname NOT IN ('cosmetic_items','shop_products')
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

-- keep anonymous telemetry ingestion working (policy cte_insert allows it)
GRANT INSERT ON public.client_telemetry_events TO anon;

-- 2) Revoke anon EXECUTE on all SECURITY DEFINER functions in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- 3) Explicit restrictive write blocks on financial/server-managed tables
DROP POLICY IF EXISTS shop_orders_no_client_insert ON public.shop_orders;
CREATE POLICY shop_orders_no_client_insert ON public.shop_orders
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS shop_orders_no_client_update ON public.shop_orders;
CREATE POLICY shop_orders_no_client_update ON public.shop_orders
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS shop_orders_no_client_delete ON public.shop_orders;
CREATE POLICY shop_orders_no_client_delete ON public.shop_orders
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS subscriptions_no_client_insert ON public.subscriptions;
CREATE POLICY subscriptions_no_client_insert ON public.subscriptions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS subscriptions_no_client_update ON public.subscriptions;
CREATE POLICY subscriptions_no_client_update ON public.subscriptions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS subscriptions_no_client_delete ON public.subscriptions;
CREATE POLICY subscriptions_no_client_delete ON public.subscriptions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- paystack_webhook_events: fail-closed by design; make it explicit
REVOKE ALL ON public.paystack_webhook_events FROM anon, authenticated;
GRANT ALL ON public.paystack_webhook_events TO service_role;
DROP POLICY IF EXISTS paystack_webhook_events_no_client_access ON public.paystack_webhook_events;
CREATE POLICY paystack_webhook_events_no_client_access ON public.paystack_webhook_events
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);