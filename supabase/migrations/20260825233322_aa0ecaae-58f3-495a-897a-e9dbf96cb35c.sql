CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR current_user IN ('supabase_admin', 'postgres', 'service_role')
     OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  NEW.daily_ai_messages := OLD.daily_ai_messages;
  NEW.last_ai_reset := OLD.last_ai_reset;
  NEW.streak_freezes := OLD.streak_freezes;
  NEW.freeze_used_dates := OLD.freeze_used_dates;
  NEW.xp := OLD.xp;
  NEW.coins := OLD.coins;
  NEW.gems := OLD.gems;
  NEW.unlocked_themes := OLD.unlocked_themes;
  NEW.unlocked_effects := OLD.unlocked_effects;
  NEW.ai_avatar_credits_used := OLD.ai_avatar_credits_used;
  NEW.ai_avatar_credits_reset_at := OLD.ai_avatar_credits_reset_at;
  NEW.trial_started_at := OLD.trial_started_at;
  RETURN NEW;
END;
$function$;

WITH ledger AS (
  SELECT user_id, GREATEST(0, COALESCE(SUM(delta), 0)::int) AS ledger_xp
  FROM public.xp_transactions
  GROUP BY user_id
), behind AS (
  SELECT p.user_id, l.ledger_xp
  FROM public.profiles p
  JOIN ledger l ON l.user_id = p.user_id
  WHERE COALESCE(p.xp, 0) < l.ledger_xp
)
UPDATE public.profiles p
SET xp = b.ledger_xp,
    updated_at = now()
FROM behind b
WHERE p.user_id = b.user_id;