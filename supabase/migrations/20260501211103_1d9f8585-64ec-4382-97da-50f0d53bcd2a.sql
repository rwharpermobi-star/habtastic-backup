
-- 1. Column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;

-- 2. Backfill existing rows: anchor to account creation
UPDATE public.profiles
SET trial_started_at = created_at
WHERE trial_started_at IS NULL;

-- 3. Update signup trigger to set trial_started_at = now() for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, trial_started_at)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'Hero'), now());
  RETURN NEW;
END;
$$;

-- 4. Lock trial_started_at against client tampering (mirrors other sensitive fields)
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role') = 'service_role' OR current_user = 'supabase_admin' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
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
$$;
