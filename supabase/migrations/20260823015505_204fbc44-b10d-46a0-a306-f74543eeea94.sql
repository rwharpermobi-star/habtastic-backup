-- 1) Remove anon (not-signed-in) read exposure
REVOKE SELECT ON public.referral_rewards FROM anon;
REVOKE SELECT ON public.referrals_safe FROM anon;

-- 2) Explicit restrictive write blocks (defense-in-depth) on server-owned tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payout_requests','weekly_scores','leaderboard_crowns',
    'referrals','ai_challenges','winston_challenges','referral_rewards'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_no_client_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false)',
      t || '_no_client_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false)',
      t || '_no_client_delete', t);
  END LOOP;
END $$;

-- Block client INSERTs on tables where inserts must be server/RPC-only.
-- (referrals INSERT stays open for create_referral_code's owner-scoped path.)
CREATE POLICY payout_requests_no_client_insert ON public.payout_requests
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY weekly_scores_no_client_insert ON public.weekly_scores
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY leaderboard_crowns_no_client_insert ON public.leaderboard_crowns
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY ai_challenges_no_client_insert ON public.ai_challenges
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY winston_challenges_no_client_insert ON public.winston_challenges
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY referral_rewards_no_client_insert ON public.referral_rewards
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY referrals_no_client_insert ON public.referrals
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);