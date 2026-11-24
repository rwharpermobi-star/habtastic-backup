
-- Explicit deny-all policies so the linter sees policies exist.
-- service_role bypasses RLS entirely, so backend access is unaffected.

CREATE POLICY "Deny all access to audit log"
ON public.profile_audit_log
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all access to security alerts"
ON public.security_alerts
AS RESTRICTIVE
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
