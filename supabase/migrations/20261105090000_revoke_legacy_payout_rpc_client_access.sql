-- Remove authenticated access to the legacy payout RPC.
-- The current admin UI uses admin_process_payout(uuid,text,text), which writes
-- the banking audit log. Keep the old two-argument overload service-role only.
REVOKE EXECUTE ON FUNCTION public.admin_process_payout(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text) TO service_role;
