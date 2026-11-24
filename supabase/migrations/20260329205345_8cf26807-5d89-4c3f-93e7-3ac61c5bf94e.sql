
-- Create a security definer function for trusted internal updates
CREATE OR REPLACE FUNCTION public.update_profile_internal(
  _user_id uuid,
  _updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    is_premium = COALESCE((_updates->>'is_premium')::boolean, is_premium),
    premium_until = COALESCE((_updates->>'premium_until')::timestamptz, premium_until),
    daily_ai_messages = COALESCE((_updates->>'daily_ai_messages')::int, daily_ai_messages),
    last_ai_reset = COALESCE((_updates->>'last_ai_reset')::date, last_ai_reset),
    streak_freezes = COALESCE((_updates->>'streak_freezes')::int, streak_freezes),
    freeze_used_dates = CASE 
      WHEN _updates ? 'freeze_used_dates' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'freeze_used_dates'))
      ELSE freeze_used_dates
    END,
    xp = COALESCE((_updates->>'xp')::int, xp),
    updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

-- Fix referrals: remove the unsafe UPDATE policy
DROP POLICY IF EXISTS "Referred user can redeem referral" ON public.referrals;
