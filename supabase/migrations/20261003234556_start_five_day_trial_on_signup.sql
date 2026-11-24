-- Every new HabTastic account starts its one-time five-day Premium trial.
-- ON CONFLICT remains DO NOTHING so recreating/auth callbacks can never re-arm
-- an existing user's trial.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, trial_started_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''),'@',1), 'Hero'),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.award_coins(NEW.id, 100, 'welcome', '{}'::jsonb);
  RETURN NEW;
END;
$function$;
