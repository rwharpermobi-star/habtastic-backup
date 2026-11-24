REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.community_clicks FROM authenticated;
GRANT INSERT ON public.community_clicks TO authenticated;
GRANT ALL ON public.community_clicks TO service_role;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES ON public.client_telemetry_events FROM authenticated;
GRANT SELECT, INSERT ON public.client_telemetry_events TO authenticated;
GRANT ALL ON public.client_telemetry_events TO service_role;