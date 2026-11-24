-- Dedicated table for telemetry-driven alerts (RUM error spikes, slow API, slow LCP).
-- Keeps the existing `security_alerts` table focused on security signals.
CREATE TABLE IF NOT EXISTS public.telemetry_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telemetry_alerts TO service_role;
GRANT SELECT, UPDATE ON public.telemetry_alerts TO authenticated;

ALTER TABLE public.telemetry_alerts ENABLE ROW LEVEL SECURITY;

-- Admins can view + acknowledge alerts; service role writes them.
CREATE POLICY "Admins can view telemetry alerts"
  ON public.telemetry_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can acknowledge telemetry alerts"
  ON public.telemetry_alerts
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_telemetry_alerts_recent
  ON public.telemetry_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_alerts_type_recent
  ON public.telemetry_alerts (alert_type, created_at DESC);

-- Add to retention job: prune > 30 days.
CREATE OR REPLACE FUNCTION public.prune_telemetry_alerts()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.telemetry_alerts WHERE created_at < now() - INTERVAL '30 days';
$$;