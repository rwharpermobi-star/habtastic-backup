-- 1. Journal memories: add UPDATE policy
CREATE POLICY "Users can update own memories"
ON public.journal_memories FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Referrals: allow referred users to read their own referrals
DROP POLICY IF EXISTS "Users can read own referrals" ON public.referrals;
CREATE POLICY "Users can read own referrals"
ON public.referrals FOR SELECT
TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- 3. Referrals: fix INSERT to enforce referred_id = auth.uid() when redeeming
DROP POLICY IF EXISTS "Users can insert own referrals" ON public.referrals;
CREATE POLICY "Users can create referrals as referrer"
ON public.referrals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = referrer_id);

-- 4. Referrals: allow updating referral when redeeming (referred_id)
CREATE POLICY "Users can redeem referrals"
ON public.referrals FOR UPDATE
TO authenticated
USING (referred_id IS NULL OR auth.uid() = referred_id)
WITH CHECK (auth.uid() = referred_id);
