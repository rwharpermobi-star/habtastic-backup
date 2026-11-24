-- Restore Auth signup after the economy RPC hardening migration.
--
-- handle_new_user() is fired by GoTrue as `supabase_auth_admin` and awards the
-- one-time welcome grant through award_coins().  The previous allow-list did
-- not include that trusted Supabase role, so award_coins() raised
-- `not_authenticated` and rolled back every new email and OAuth user.
CREATE OR REPLACE FUNCTION public.is_service_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT session_user IN (
           'service_role',
           'supabase_auth_admin',
           'supabase_admin',
           'postgres'
         )
      OR COALESCE(
           current_setting('request.jwt.claims', true)::jsonb->>'role',
           ''
         ) = 'service_role';
$function$;

COMMENT ON FUNCTION public.is_service_caller() IS
  'True only for trusted Supabase service contexts, including the GoTrue auth trigger role.';
