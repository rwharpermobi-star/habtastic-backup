CREATE OR REPLACE FUNCTION public.xp_to_next_level(_level integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT (round((75 * power(GREATEST(_level, 1), 0.45)) / 5))::int * 5;
$function$;