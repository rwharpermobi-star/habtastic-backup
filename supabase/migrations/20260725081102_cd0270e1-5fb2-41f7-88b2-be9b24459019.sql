
-- 1) Referrals: revoke admin/fraud column reads from regular users
REVOKE SELECT ON public.referrals FROM authenticated;
GRANT SELECT (
  id, referrer_id, referred_id, referral_code, redeemed_at, created_at,
  purchase_completed, rewarded, reward_days, joined_xp_awarded,
  retention_xp_awarded, retention_eligible_at
) ON public.referrals TO authenticated;

-- 2) Paystack webhook events: hide raw_payload/payload_summary from clients
DROP POLICY IF EXISTS "Users read own paystack events" ON public.paystack_webhook_events;
-- (No replacement policy for authenticated; users query via the safe view below.)

CREATE OR REPLACE VIEW public.paystack_webhook_events_safe
WITH (security_invoker = true) AS
SELECT id, event_type, source, status, error_message, user_id,
       paystack_reference, paystack_subscription_code,
       received_at, processed_at, idempotency_key
FROM public.paystack_webhook_events
WHERE user_id = auth.uid();

GRANT SELECT ON public.paystack_webhook_events_safe TO authenticated;

-- Re-add a minimal RLS policy so the view (with security_invoker) can read own rows
CREATE POLICY "Users read own paystack events (safe cols)"
  ON public.paystack_webhook_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Revoke direct column access to sensitive payload columns from authenticated
REVOKE SELECT ON public.paystack_webhook_events FROM authenticated;
GRANT SELECT (
  id, event_type, source, status, error_message, user_id,
  paystack_reference, paystack_subscription_code,
  received_at, processed_at, idempotency_key
) ON public.paystack_webhook_events TO authenticated;

-- 3) Admin analytics views: revoke from authenticated (admins read via get_admin_analytics SECURITY DEFINER)
REVOKE SELECT ON public.community_dau FROM authenticated, anon;
REVOKE SELECT ON public.community_feed_engagement FROM authenticated, anon;
REVOKE SELECT ON public.community_challenge_stats FROM authenticated, anon;
REVOKE SELECT ON public.facebook_conversion_stats FROM authenticated, anon;
-- community_top_members is intentionally kept public — it powers the community "Most Active" widget for all users.

-- 4) Email infra: tighten policy role scope to service_role explicitly (defense-in-depth)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('email_send_state','suppressed_emails','email_send_log','email_unsubscribe_tokens')
      AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', r.policyname, r.tablename);
  END LOOP;
END $$;
