
CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_service_role boolean;
  _caller_role text;
  _headers jsonb;
  _ip text;
  _ua text;
  _req_id text;
  _attempted text[];
  _stripped text[] := ARRAY[]::text[];
  _had_premium_attempt boolean := false;
  _had_economy_attempt boolean := false;
  _economy_field text;
  -- Narrowed: only the highest-impact economy fields. Other "sensitive"
  -- fields (streak_freezes, freeze_used_dates, unlocked_themes/effects,
  -- ai_avatar_credits_*, daily_ai_messages, last_ai_reset, trial_started_at)
  -- are still protected from direct UPDATE by the protect_profile_fields
  -- trigger, but legitimate flows can still set them via this RPC.
  _economy_fields text[] := ARRAY['xp','coins','gems'];
BEGIN
  _is_service_role := (
    current_setting('role', true) = 'service_role'
    OR current_user = 'supabase_admin'
    OR current_user = 'postgres'
    OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role'
  );

  _caller_role := CASE WHEN _is_service_role THEN 'service_role'
                       WHEN auth.uid() IS NOT NULL THEN 'authenticated'
                       ELSE 'anon' END;

  BEGIN
    _headers := current_setting('request.headers', true)::jsonb;
    _ip := COALESCE(_headers->>'x-forwarded-for', _headers->>'cf-connecting-ip');
    _ua := _headers->>'user-agent';
    _req_id := _headers->>'x-request-id';
  EXCEPTION WHEN others THEN
    _headers := NULL;
  END;

  _attempted := ARRAY(SELECT jsonb_object_keys(_updates));

  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO public.profile_audit_log
      (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, ip, user_agent, request_id)
    VALUES
      (_user_id, auth.uid(), _caller_role, 'cross_user_attempt', 'alert', _attempted, _ip, _ua, _req_id);
    RAISE EXCEPTION 'Unauthorized: cannot update another user''s profile';
  END IF;

  IF NOT _is_service_role AND (_updates ? 'is_premium' OR _updates ? 'premium_until') THEN
    _had_premium_attempt := true;
    _stripped := _stripped || ARRAY['is_premium','premium_until'];
    _updates := _updates - 'is_premium' - 'premium_until';
  END IF;

  IF NOT _is_service_role THEN
    FOREACH _economy_field IN ARRAY _economy_fields LOOP
      IF _updates ? _economy_field THEN
        _had_economy_attempt := true;
        _stripped := _stripped || _economy_field;
        _updates := _updates - _economy_field;
      END IF;
    END LOOP;
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

  IF _had_premium_attempt THEN
    INSERT INTO public.profile_audit_log
      (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
    VALUES
      (_user_id, auth.uid(), _caller_role, 'premium_attempt', 'alert', _attempted,
       jsonb_build_object('stripped', _stripped), _ip, _ua, _req_id);
  END IF;

  IF _had_economy_attempt THEN
    INSERT INTO public.profile_audit_log
      (user_id, auth_uid, caller_role, event_type, severity, attempted_fields, delta, ip, user_agent, request_id)
    VALUES
      (_user_id, auth.uid(), _caller_role, 'economy_field_attempt', 'warn', _attempted,
       jsonb_build_object('stripped', _stripped), _ip, _ua, _req_id);
  END IF;
END;
$function$;

-- Re-grant column UPDATE on lower-risk fields so existing flows keep working.
-- (The protect_profile_fields trigger still strips direct .update on these.)
DO $$ BEGIN
  EXECUTE 'GRANT UPDATE (streak_freezes, freeze_used_dates, unlocked_themes, unlocked_effects, daily_ai_messages, last_ai_reset, trial_started_at, ai_avatar_credits_used, ai_avatar_credits_reset_at) ON public.profiles TO authenticated';
EXCEPTION WHEN others THEN NULL; END $$;
