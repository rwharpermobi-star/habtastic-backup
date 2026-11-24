-- Harden update_profile_internal: when called by an end user (not service role),
-- silently drop is_premium and premium_until from the updates payload so a
-- client cannot grant themselves Premium. Service role (Stripe webhook,
-- check-subscription, etc.) can still set these freely.
CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_service_role boolean;
BEGIN
  -- Ownership check: a logged-in user can only update their own row
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: cannot update another user''s profile';
  END IF;

  -- Detect whether the caller is the service role (Stripe webhook, edge fn with SR key)
  _is_service_role := (
    current_setting('role', true) = 'service_role'
    OR current_user = 'supabase_admin'
    OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
  );

  -- End users are NEVER allowed to set premium status from the client.
  -- Strip these fields from the payload silently if the caller isn't service role.
  IF NOT _is_service_role THEN
    _updates := _updates - 'is_premium' - 'premium_until';
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

-- Reinforce the table-level trigger: it already blocks direct UPDATEs to
-- is_premium / premium_until from non-service-role callers, which means even
-- the few lingering client-side `supabase.from('profiles').update({...})`
-- calls cannot escalate. (See protect_profile_fields trigger.)