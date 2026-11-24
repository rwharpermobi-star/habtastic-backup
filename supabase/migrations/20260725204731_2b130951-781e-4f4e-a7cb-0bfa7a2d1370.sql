-- 1) paystack_webhook_events: drop user SELECT policy; only service_role reads base
DROP POLICY IF EXISTS "Users read own paystack events via safe view" ON public.paystack_webhook_events;
REVOKE SELECT ON public.paystack_webhook_events FROM anon, authenticated;

-- 2) referrals: drop the user SELECT policy on base; users read via referrals_safe view
DROP POLICY IF EXISTS "Users can read own referrals" ON public.referrals;
REVOKE SELECT ON public.referrals FROM anon, authenticated;

-- Ensure referrals_safe view exists and only exposes safe columns
DROP VIEW IF EXISTS public.referrals_safe;
CREATE VIEW public.referrals_safe
WITH (security_invoker = true) AS
SELECT
  id, referrer_id, referred_id, referral_code,
  purchase_completed, rewarded, reward_days,
  joined_xp_awarded, retention_xp_awarded, retention_eligible_at,
  redeemed_at, created_at
FROM public.referrals
WHERE auth.uid() = referrer_id OR auth.uid() = referred_id;

GRANT SELECT ON public.referrals_safe TO authenticated;

-- 3) Admin analytics views: revoke any implicit access from anon/authenticated
REVOKE ALL ON public.community_dau FROM anon, authenticated;
REVOKE ALL ON public.community_feed_engagement FROM anon, authenticated;
REVOKE ALL ON public.community_challenge_stats FROM anon, authenticated;
REVOKE ALL ON public.facebook_conversion_stats FROM anon, authenticated;