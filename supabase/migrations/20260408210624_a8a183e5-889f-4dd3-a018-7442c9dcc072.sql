
-- Add currency and unlock columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gems integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlocked_themes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unlocked_effects text[] NOT NULL DEFAULT '{}';

-- Create shop_purchases table
CREATE TABLE public.shop_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  item_id text NOT NULL,
  item_type text NOT NULL,
  purchased_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own purchases"
  ON public.shop_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own purchases"
  ON public.shop_purchases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update the RPC to handle new sensitive fields
CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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
    coins = COALESCE((_updates->>'coins')::int, coins),
    gems = COALESCE((_updates->>'gems')::int, gems),
    unlocked_themes = CASE
      WHEN _updates ? 'unlocked_themes' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'unlocked_themes'))
      ELSE unlocked_themes
    END,
    unlocked_effects = CASE
      WHEN _updates ? 'unlocked_effects' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'unlocked_effects'))
      ELSE unlocked_effects
    END,
    updated_at = now()
  WHERE user_id = _user_id;
END;
$function$;

-- Update protect_profile_fields trigger to also protect coins/gems
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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
  RETURN NEW;
END;
$function$;
