-- 1. ai_challenges: no client INSERT/UPDATE
DROP POLICY IF EXISTS ai_ch_own ON public.ai_challenges;
CREATE POLICY ai_ch_select_own ON public.ai_challenges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ai_ch_delete_own ON public.ai_challenges FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON public.ai_challenges FROM authenticated;
GRANT SELECT, DELETE ON public.ai_challenges TO authenticated;
GRANT ALL ON public.ai_challenges TO service_role;

-- 2. winston_challenges: no client INSERT/UPDATE; status changes via RPC
DROP POLICY IF EXISTS wch_own ON public.winston_challenges;
CREATE POLICY wch_select_own ON public.winston_challenges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY wch_delete_own ON public.winston_challenges FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE ON public.winston_challenges FROM authenticated;
GRANT SELECT, DELETE ON public.winston_challenges TO authenticated;
GRANT ALL ON public.winston_challenges TO service_role;

CREATE OR REPLACE FUNCTION public.respond_winston_challenge(_challenge_id uuid, _accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.winston_challenges
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END
   WHERE id = _challenge_id
     AND user_id = _uid
     AND status IN ('pending', 'suggested');
  RETURN jsonb_build_object('ok', FOUND);
END $$;
REVOKE ALL ON FUNCTION public.respond_winston_challenge(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_winston_challenge(uuid, boolean) TO authenticated;

-- 3. community_challenge_participants: INSERT only from client
DROP POLICY IF EXISTS ccp_own_write ON public.community_challenge_participants;
CREATE POLICY ccp_insert_own ON public.community_challenge_participants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND progress = 0 AND completed_at IS NULL AND claimed_at IS NULL);
REVOKE UPDATE ON public.community_challenge_participants FROM authenticated;
GRANT SELECT, INSERT ON public.community_challenge_participants TO authenticated;
GRANT ALL ON public.community_challenge_participants TO service_role;

-- 4. friend_challenges: no client UPDATE (acceptance/progress server-side)
DROP POLICY IF EXISTS fc_update ON public.friend_challenges;
REVOKE UPDATE ON public.friend_challenges FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.friend_challenges TO authenticated;
GRANT ALL ON public.friend_challenges TO service_role;

-- 5. referrals: no client UPDATE at all; redemption via redeem_referral RPC
DROP POLICY IF EXISTS "Users can redeem referrals" ON public.referrals;
REVOKE UPDATE ON public.referrals FROM authenticated;
GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

-- 6. audio bucket: owner-scoped policies (path = <uid>/...)
DROP POLICY IF EXISTS "audio_select_own" ON storage.objects;
DROP POLICY IF EXISTS "audio_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "audio_update_own" ON storage.objects;
DROP POLICY IF EXISTS "audio_delete_own" ON storage.objects;
CREATE POLICY "audio_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "audio_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "audio_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "audio_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 7. No SECURITY DEFINER function is callable by signed-out visitors
REVOKE EXECUTE ON FUNCTION public.validate_referral_code(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO authenticated;

-- 8. Admin-only helper missing its role guard
CREATE OR REPLACE FUNCTION public.admin_list_referral_signals(_limit integer DEFAULT 100)
RETURNS TABLE(referral_id uuid, referrer_id uuid, referred_id uuid, created_at timestamp with time zone, purchase_completed boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT r.id, r.referrer_id, r.referred_id, r.created_at, r.purchase_completed
    FROM public.referrals r
    ORDER BY r.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
END $$;