-- 1) paystack_webhook_events: drop client SELECT policy; only safe view is readable
DROP POLICY IF EXISTS "Users read own paystack events via safe view" ON public.paystack_webhook_events;
REVOKE SELECT ON public.paystack_webhook_events FROM anon, authenticated;

GRANT SELECT ON public.paystack_webhook_events_safe TO authenticated;

-- 2) referrals: safe view without admin fraud fields; block client SELECT on base table
CREATE OR REPLACE VIEW public.referrals_safe
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  id,
  referrer_id,
  referred_id,
  referral_code,
  purchase_completed,
  rewarded,
  reward_days,
  created_at,
  redeemed_at,
  joined_xp_awarded,
  retention_xp_awarded,
  retention_eligible_at
FROM public.referrals
WHERE referrer_id = auth.uid() OR referred_id = auth.uid();

REVOKE ALL ON public.referrals_safe FROM anon, authenticated;
GRANT SELECT ON public.referrals_safe TO authenticated;

DROP POLICY IF EXISTS "Users can read own referrals" ON public.referrals;
REVOKE SELECT ON public.referrals FROM anon, authenticated;

-- Admins can still read the full referrals table (including admin fields)
DROP POLICY IF EXISTS "Admins can read referrals" ON public.referrals;
CREATE POLICY "Admins can read referrals"
ON public.referrals FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3) community_top_members: revoke direct access, expose via SECURITY DEFINER function
REVOKE ALL ON public.community_top_members FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_community_top_members(_limit integer DEFAULT 5)
RETURNS TABLE(user_id uuid, reactions_received bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, reactions_received
  FROM public.community_top_members
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.get_community_top_members(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_top_members(integer) TO authenticated;