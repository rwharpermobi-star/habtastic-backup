
-- Fix overly permissive update policy on referrals
DROP POLICY "Anyone can update referrals to redeem" ON public.referrals;

CREATE POLICY "Referred user can redeem referral" ON public.referrals
  FOR UPDATE TO authenticated 
  USING (referred_id IS NULL OR referred_id = auth.uid())
  WITH CHECK (referred_id = auth.uid());
