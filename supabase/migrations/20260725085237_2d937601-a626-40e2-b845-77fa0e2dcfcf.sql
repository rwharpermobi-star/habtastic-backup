
-- === referrals: column-level SELECT grants for authenticated ===
REVOKE SELECT ON public.referrals FROM authenticated;
REVOKE SELECT ON public.referrals FROM anon;
GRANT SELECT
  (id, referrer_id, referred_id, referral_code, purchase_completed,
   rewarded, reward_days, joined_xp_awarded, retention_xp_awarded,
   retention_eligible_at, redeemed_at, created_at)
  ON public.referrals TO authenticated;

-- === paystack_webhook_events: revoke base SELECT, grant safe view ===
REVOKE SELECT ON public.paystack_webhook_events FROM authenticated;
REVOKE SELECT ON public.paystack_webhook_events FROM anon;

-- Drop the base-table SELECT policy since users must go through the safe view.
DROP POLICY IF EXISTS "Users read own paystack events (safe cols)"
  ON public.paystack_webhook_events;

-- Recreate the safe view as security_invoker so RLS on the base still applies
-- when read via the view — but since we dropped the user SELECT policy, we
-- add a targeted policy just for view reads via a helper. Simpler: use a
-- SECURITY DEFINER view function-less approach — recreate view with
-- security_invoker=false and gate row access inside the view itself.
DROP VIEW IF EXISTS public.paystack_webhook_events_safe;
CREATE VIEW public.paystack_webhook_events_safe
WITH (security_invoker = true) AS
SELECT id, event_type, source, status, error_message, user_id,
       paystack_reference, paystack_subscription_code,
       received_at, processed_at, idempotency_key
FROM public.paystack_webhook_events;

-- Re-add a narrow SELECT policy on the base restricted to the safe view's
-- reads (RLS on base still runs because security_invoker=true).
CREATE POLICY "Users read own paystack events via safe view"
  ON public.paystack_webhook_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Grant SELECT only on the safe view to authenticated. Base table remains
-- readable only by service_role and admin RPCs.
GRANT SELECT ON public.paystack_webhook_events_safe TO authenticated;
REVOKE SELECT ON public.paystack_webhook_events_safe FROM anon;
