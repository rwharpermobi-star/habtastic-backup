
-- Add premium fields to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS daily_ai_messages integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ai_reset date;

-- Create referrals table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid,
  referral_code text NOT NULL UNIQUE,
  redeemed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own referrals" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id);

CREATE POLICY "Users can insert own referrals" ON public.referrals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY "Anyone can update referrals to redeem" ON public.referrals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
