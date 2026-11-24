
REVOKE EXECUTE ON FUNCTION public.toggle_feed_reaction(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.respond_partner_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_community_challenge(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_community_challenge_progress(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_community_challenge(uuid) FROM PUBLIC, anon;
