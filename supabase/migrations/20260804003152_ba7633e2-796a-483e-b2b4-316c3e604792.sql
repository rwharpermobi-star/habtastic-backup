-- 1. Restrict avatar reads to the owner's own folder (bucket is private; other users
-- view avatars via long-lived signed URLs stored on profiles.avatar_url).
DROP POLICY IF EXISTS "Avatar images readable by signed-in users" ON storage.objects;

CREATE POLICY "Users can read own avatar files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Remove raw Paystack webhook data from the client-facing API surface entirely
-- (also removes it from the GraphQL schema for signed-in users).
REVOKE ALL ON public.paystack_webhook_events_safe FROM authenticated;
REVOKE ALL ON public.paystack_webhook_events_safe FROM anon;
GRANT SELECT ON public.paystack_webhook_events_safe TO service_role;

-- 3. Admin-only accessor for the redacted webhook event list.
CREATE OR REPLACE FUNCTION public.admin_list_paystack_webhook_events(_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, event_type text, reference text, status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT v.id, v.event_type, v.reference, v.status, v.created_at
  FROM public.paystack_webhook_events_safe v
  ORDER BY v.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END $$;

REVOKE ALL ON FUNCTION public.admin_list_paystack_webhook_events(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_paystack_webhook_events(integer) TO authenticated;
