-- 1) reward_rules: no longer readable by logged-out visitors
DROP POLICY IF EXISTS reward_rules_read ON public.reward_rules;
CREATE POLICY reward_rules_read_authenticated
  ON public.reward_rules FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.reward_rules FROM anon;
GRANT SELECT ON public.reward_rules TO authenticated;
GRANT ALL ON public.reward_rules TO service_role;

-- 2) user_roles: explicit restrictive deny of client writes (defense in depth)
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS user_roles_no_client_insert ON public.user_roles;
CREATE POLICY user_roles_no_client_insert
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_client_update ON public.user_roles;
CREATE POLICY user_roles_no_client_update
  ON public.user_roles AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_client_delete ON public.user_roles;
CREATE POLICY user_roles_no_client_delete
  ON public.user_roles AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);