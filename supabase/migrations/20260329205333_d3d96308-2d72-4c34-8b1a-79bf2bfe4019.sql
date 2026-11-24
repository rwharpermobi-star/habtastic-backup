
-- 1. Protect sensitive profile fields from direct client updates
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  NEW.daily_ai_messages := OLD.daily_ai_messages;
  NEW.last_ai_reset := OLD.last_ai_reset;
  NEW.streak_freezes := OLD.streak_freezes;
  NEW.freeze_used_dates := OLD.freeze_used_dates;
  NEW.xp := OLD.xp;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();
