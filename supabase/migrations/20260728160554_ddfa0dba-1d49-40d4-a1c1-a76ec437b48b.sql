
-- 1. community_challenge_participants: replace public read with own-row read
DROP POLICY IF EXISTS "Public read participants" ON public.community_challenge_participants;
CREATE POLICY "Users read own participation"
  ON public.community_challenge_participants
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. profile_privacy: replace public read with own-row read
DROP POLICY IF EXISTS "Public read privacy" ON public.profile_privacy;
CREATE POLICY "Users read own privacy"
  ON public.profile_privacy
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
