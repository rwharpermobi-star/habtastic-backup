
-- Lock down friend_challenges: require knowing the challenge_code via SELECT first
-- (already restricted by SELECT policy to challenger/challenged_id), but tighten UPDATE
-- so users cannot mark themselves as challenged unless code is verified out-of-band via app.
DROP POLICY IF EXISTS "Users can accept challenges" ON public.friend_challenges;
CREATE POLICY "Users can accept challenges"
ON public.friend_challenges
FOR UPDATE
TO authenticated
USING (
  challenged_id IS NULL
  AND challenger_id <> auth.uid()
)
WITH CHECK (
  auth.uid() = challenged_id
  AND challenger_id <> auth.uid()
);

-- Explicit deny INSERT/UPDATE/DELETE on shop_purchases for clients (server-side only).
DROP POLICY IF EXISTS "Block client writes to shop purchases" ON public.shop_purchases;
CREATE POLICY "Block client writes to shop purchases"
ON public.shop_purchases
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Re-allow SELECT (RESTRICTIVE above blocks reads too; need permissive that passes both).
-- Actually RESTRICTIVE FOR ALL blocks SELECT — split: only restrict writes.
DROP POLICY IF EXISTS "Block client writes to shop purchases" ON public.shop_purchases;
CREATE POLICY "Block client inserts on shop purchases"
ON public.shop_purchases AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block client updates on shop purchases"
ON public.shop_purchases AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block client deletes on shop purchases"
ON public.shop_purchases AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- Revoke EXECUTE on internal SECURITY DEFINER functions (only callable via service_role/triggers).
REVOKE EXECUTE ON FUNCTION public.reward_referrer(uuid, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prune_old_chat_messages() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rollup_security_alert() FROM anon, authenticated, public;

-- Revoke from anon for client-callable definer functions (still need authenticated).
REVOKE EXECUTE ON FUNCTION public.update_profile_internal(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text) FROM anon, public;
