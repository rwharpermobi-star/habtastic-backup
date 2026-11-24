-- Source-control copy of the production migration applied by Lovable as
-- version 20260831023133 (`restrict_reward_rules_and_lock_user_roles`).
-- Keeping the production version number makes Supabase treat this migration
-- as already applied there while reproducing the same hardening in new envs.

-- reward_rules is internal economy tuning data: signed-in read only.
DROP POLICY IF EXISTS reward_rules_read ON public.reward_rules;
CREATE POLICY reward_rules_read_authenticated
  ON public.reward_rules FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.reward_rules FROM anon;
GRANT SELECT ON public.reward_rules TO authenticated;
GRANT ALL ON public.reward_rules TO service_role;

-- Role changes remain backend-only even if a permissive client policy is
-- accidentally introduced later.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS user_roles_no_client_insert ON public.user_roles;
CREATE POLICY user_roles_no_client_insert
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_client_update ON public.user_roles;
CREATE POLICY user_roles_no_client_update
  ON public.user_roles AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS user_roles_no_client_delete ON public.user_roles;
CREATE POLICY user_roles_no_client_delete
  ON public.user_roles AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);
