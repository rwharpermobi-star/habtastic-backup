-- Helper: is this user's ranking data visible to others?
CREATE OR REPLACE FUNCTION public.is_leaderboard_visible(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profile_privacy pp
    WHERE pp.user_id = _user_id
      AND (pp.show_on_leaderboard = false OR pp.profile_public = false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_leaderboard_visible(uuid) TO authenticated;

-- weekly_scores: own rows, or opted-in users only
DROP POLICY IF EXISTS ws_view ON public.weekly_scores;
CREATE POLICY ws_view ON public.weekly_scores
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_leaderboard_visible(user_id));

-- leaderboard_crowns: own rows, or opted-in users only
DROP POLICY IF EXISTS "Crowns public read" ON public.leaderboard_crowns;
CREATE POLICY "Crowns visible for opted-in users" ON public.leaderboard_crowns
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_leaderboard_visible(user_id));

-- community_challenge_participants: own rows, or opted-in users only
DROP POLICY IF EXISTS ccp_view ON public.community_challenge_participants;
CREATE POLICY ccp_view ON public.community_challenge_participants
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_leaderboard_visible(user_id));

-- friend_challenges: allow the two participants to delete their own challenge
DROP POLICY IF EXISTS fc_delete ON public.friend_challenges;
CREATE POLICY fc_delete ON public.friend_challenges
FOR DELETE TO authenticated
USING (auth.uid() = creator_id OR auth.uid() = opponent_id);

-- GraphQL is unused by this app: remove schema discovery for app roles
REVOKE ALL ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;