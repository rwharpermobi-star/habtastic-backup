-- Fix the remaining security-definer view by making referrals_safe invoker-based
-- while preserving column-level protection for fraud-review fields.

-- Regular users can only read non-sensitive referral columns, and only for rows
-- where they are the referrer or referred user.
REVOKE SELECT ON public.referrals FROM anon, authenticated;
GRANT SELECT (
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
) ON public.referrals TO authenticated;

DROP POLICY IF EXISTS "Users can read own referrals" ON public.referrals;
CREATE POLICY "Users can read own referrals"
ON public.referrals
FOR SELECT
TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE OR REPLACE VIEW public.referrals_safe
WITH (security_invoker = true, security_barrier = true) AS
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
FROM public.referrals;

REVOKE ALL ON public.referrals_safe FROM anon, authenticated;
GRANT SELECT ON public.referrals_safe TO authenticated;

-- Ensure the existing sanitized payment webhook view remains usable without
-- exposing raw_payload or payload_summary to clients.
REVOKE SELECT ON public.paystack_webhook_events FROM anon, authenticated;
GRANT SELECT (
  id,
  event_type,
  source,
  status,
  error_message,
  user_id,
  paystack_reference,
  paystack_subscription_code,
  received_at,
  processed_at,
  idempotency_key
) ON public.paystack_webhook_events TO authenticated;

DROP POLICY IF EXISTS "Users read own paystack events via safe view" ON public.paystack_webhook_events;
CREATE POLICY "Users read own paystack events via safe view"
ON public.paystack_webhook_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

ALTER VIEW public.paystack_webhook_events_safe SET (security_invoker = true);
REVOKE ALL ON public.paystack_webhook_events_safe FROM anon, authenticated;
GRANT SELECT ON public.paystack_webhook_events_safe TO authenticated;