-- 1) Add ownership check to update_profile_internal to prevent cross-user tampering
CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only allow service role or the profile owner to call this
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot update another user''s profile';
  END IF;

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
    ai_avatar_credits_used = COALESCE((_updates->>'ai_avatar_credits_used')::int, ai_avatar_credits_used),
    ai_avatar_credits_reset_at = COALESCE((_updates->>'ai_avatar_credits_reset_at')::timestamptz, ai_avatar_credits_reset_at),
    updated_at = now()
  WHERE user_id = _user_id;
END;
$function$;

-- 2) Remove client INSERT policy on shop_purchases so users can't fabricate purchases.
-- Server-side flows (service role / SECURITY DEFINER) can still insert.
DROP POLICY IF EXISTS "Users can insert own purchases" ON public.shop_purchases;