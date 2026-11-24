-- 1) Lock down SECURITY DEFINER functions: only service role / triggers should call these
REVOKE ALL ON FUNCTION public.update_profile_internal(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reward_referrer(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;

-- 2) SECURITY: remove legacy notification dispatcher schedule.
--
-- The original migration embedded a backend URL and bearer credential in
-- committed SQL. Static credentials must never be stored in source.
-- The active scheduler must be provisioned separately using server-side secret
-- storage (for example Supabase Vault) and no raw key/token may be committed.

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-every-minute')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'notification-dispatcher-every-minute'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;
