
ALTER VIEW public.community_trending_feed SET (security_invoker = on);
ALTER VIEW public.community_top_members   SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.add_feed_comment(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_feed_comment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_content(text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_block(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.toggle_mute(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_community_explorer() FROM PUBLIC, anon;
