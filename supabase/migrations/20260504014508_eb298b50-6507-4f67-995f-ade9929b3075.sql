
-- Internal/service-only functions: revoke from anon and authenticated
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reward_referrer(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_profile_internal(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_old_chat_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_referral_code(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollup_security_alert() FROM PUBLIC, anon, authenticated;
