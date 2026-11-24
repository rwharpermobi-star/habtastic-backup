
-- Weekly summaries: add UPDATE and DELETE policies
CREATE POLICY "Users can update own summaries"
  ON public.weekly_summaries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own summaries"
  ON public.weekly_summaries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Referrals: tighten UPDATE policy to require the user provides their own id as referred_id
-- Drop the old permissive policy and replace with a stricter one
DROP POLICY IF EXISTS "Users can redeem referrals" ON public.referrals;

CREATE POLICY "Users can redeem referrals"
  ON public.referrals FOR UPDATE
  TO authenticated
  USING (referred_id IS NULL AND referrer_id != auth.uid())
  WITH CHECK (auth.uid() = referred_id);
