-- Fix Lovable access-control findings without broadening any client access.

-- Former accountability partners must lose access to private check-ins as soon
-- as a partnership is ended or otherwise no longer accepted.
DROP POLICY IF EXISTS pc_view ON public.partner_checkins;
CREATE POLICY pc_view
  ON public.partner_checkins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accountability_partners AS a
      WHERE a.id = partner_checkins.partnership_id
        AND a.status = 'accepted'
        AND a.ended_at IS NULL
        AND (
          (SELECT auth.uid()) = a.requester_id
          OR (SELECT auth.uid()) = a.partner_id
        )
    )
  );

-- Reactions are visible only when the underlying feed item is itself visible
-- to the caller, rather than to every authenticated account unconditionally.
DROP POLICY IF EXISTS cfr_view ON public.community_feed_reactions;
CREATE POLICY cfr_view
  ON public.community_feed_reactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_feed AS f
      WHERE f.id = community_feed_reactions.feed_id
        AND (
          f.is_hidden = false
          OR f.user_id = (SELECT auth.uid())
          OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
        )
    )
  );

-- reward_rules is internal tuning data. Client code uses display mirrors and
-- server-authoritative RPCs, so direct signed-in reads are unnecessary.
DROP POLICY IF EXISTS reward_rules_read_authenticated ON public.reward_rules;
REVOKE SELECT ON TABLE public.reward_rules FROM authenticated;
GRANT ALL ON TABLE public.reward_rules TO service_role;


-- Check-in writes are also limited to accepted, non-ended partnerships.
DROP POLICY IF EXISTS pc_insert ON public.partner_checkins;
CREATE POLICY pc_insert
  ON public.partner_checkins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.accountability_partners AS a
      WHERE a.id = partner_checkins.partnership_id
        AND a.status = 'accepted'
        AND a.ended_at IS NULL
        AND (
          (SELECT auth.uid()) = a.requester_id
          OR (SELECT auth.uid()) = a.partner_id
        )
    )
  );

-- Push credentials are server-managed. Clients may inspect their own rows but
-- cannot insert, update, or delete token/subscription records directly.
REVOKE ALL PRIVILEGES ON TABLE public.device_tokens FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT SELECT ON TABLE public.device_tokens TO authenticated;
GRANT SELECT ON TABLE public.push_subscriptions TO authenticated;

DROP POLICY IF EXISTS dt_own ON public.device_tokens;
DROP POLICY IF EXISTS dt_read_own ON public.device_tokens;
CREATE POLICY dt_read_own
  ON public.device_tokens
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS ps_own ON public.push_subscriptions;
DROP POLICY IF EXISTS ps_read_own ON public.push_subscriptions;
CREATE POLICY ps_read_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
