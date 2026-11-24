-- Recreate referrals_safe as a security-definer view (default) so it runs
-- with the view owner's privileges and can read the base referrals table,
-- while still filtering rows to the current auth.uid(). This restores the
-- Refer-a-Friend stats/history without re-granting base-table SELECT to
-- authenticated (which would leak fraud/admin columns).
DROP VIEW IF EXISTS public.referrals_safe;
CREATE VIEW public.referrals_safe AS
SELECT
  id, referrer_id, referred_id, referral_code,
  purchase_completed, rewarded, reward_days,
  joined_xp_awarded, retention_xp_awarded, retention_eligible_at,
  redeemed_at, created_at
FROM public.referrals
WHERE auth.uid() = referrer_id OR auth.uid() = referred_id;

GRANT SELECT ON public.referrals_safe TO authenticated;