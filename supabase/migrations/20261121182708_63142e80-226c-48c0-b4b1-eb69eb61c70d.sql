DROP POLICY IF EXISTS "referral_reward_program_read_config" ON public.referral_reward_program;

CREATE POLICY "referral_reward_program_admin_read"
ON public.referral_reward_program
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.get_referral_program_bonuses()
RETURNS TABLE (signup_xp_bonus integer, signup_points_bonus integer, retention_xp_bonus integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.signup_xp_bonus, p.signup_points_bonus, p.retention_xp_bonus
  FROM public.referral_reward_program p
  WHERE p.id IS TRUE
    AND auth.uid() IS NOT NULL
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_referral_program_bonuses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_referral_program_bonuses() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_referral_program_bonuses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referral_program_bonuses() TO service_role;