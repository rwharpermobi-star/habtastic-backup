-- Private telemetry must only be written by the authenticated telemetry-ingest
-- Edge Function using the service role. Browser/mobile clients have no direct
-- table INSERT path, preventing fabricated history via PostgREST.
REVOKE INSERT ON public.client_telemetry_events FROM anon, authenticated;
DROP POLICY IF EXISTS cte_insert ON public.client_telemetry_events;

GRANT ALL ON public.client_telemetry_events TO service_role;

-- Admin reads remain protected by the existing cte_admin_view RLS policy.
GRANT SELECT ON public.client_telemetry_events TO authenticated;
