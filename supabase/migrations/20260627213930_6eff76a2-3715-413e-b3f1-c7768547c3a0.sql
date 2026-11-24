-- 1) Pin search_path on pgmq helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;

-- 2) RESTRICTIVE deny policies on gem_transactions for anon + authenticated
--    (service_role bypasses RLS; SECURITY DEFINER RPCs continue to write.)
DROP POLICY IF EXISTS "gem_tx_block_client_insert" ON public.gem_transactions;
DROP POLICY IF EXISTS "gem_tx_block_client_update" ON public.gem_transactions;
DROP POLICY IF EXISTS "gem_tx_block_client_delete" ON public.gem_transactions;

CREATE POLICY "gem_tx_block_client_insert"
  ON public.gem_transactions AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "gem_tx_block_client_update"
  ON public.gem_transactions AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "gem_tx_block_client_delete"
  ON public.gem_transactions AS RESTRICTIVE
  FOR DELETE TO anon, authenticated
  USING (false);