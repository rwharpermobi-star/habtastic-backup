-- HabTastic Free users can create and edit unlimited habits.
-- Keep the existing trigger names for compatibility while removing the obsolete cap.
CREATE OR REPLACE FUNCTION public.enforce_free_habit_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_free_habit_update_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;
