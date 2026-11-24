-- 1. community_clicks: require authenticated caller owning the row + destination allowlist
DROP POLICY IF EXISTS clicks_insert ON public.community_clicks;
CREATE POLICY clicks_insert ON public.community_clicks
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND destination IN ('facebook','tiktok')
);
REVOKE INSERT ON public.community_clicks FROM anon;

-- 2. community_feed_reactions: only reactions on visible feed posts
DROP POLICY IF EXISTS cfr_view ON public.community_feed_reactions;
CREATE POLICY cfr_view ON public.community_feed_reactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.community_feed f
    WHERE f.id = community_feed_reactions.feed_id
      AND f.is_hidden = false
  )
);

-- 3. friend_challenges: no open-challenge discovery by unrelated users
DROP POLICY IF EXISTS fc_view ON public.friend_challenges;
CREATE POLICY fc_view ON public.friend_challenges
FOR SELECT TO authenticated
USING (auth.uid() = creator_id OR auth.uid() = opponent_id);