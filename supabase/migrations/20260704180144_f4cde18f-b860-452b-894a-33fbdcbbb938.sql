-- Enable realtime for referrals so referrers see new signups instantly
ALTER TABLE public.referrals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.referrals;

-- Backfill: ensure every existing user has a permanent referral code owner row.
-- Idempotent — ensure_referral_code_for returns existing code if present.
DO $$
DECLARE _u record;
BEGIN
  FOR _u IN
    SELECT id FROM auth.users
    WHERE id NOT IN (
      SELECT referrer_id FROM public.referrals WHERE referred_id IS NULL
    )
  LOOP
    BEGIN
      PERFORM public.ensure_referral_code_for(_u.id);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;