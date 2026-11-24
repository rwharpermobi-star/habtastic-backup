CREATE OR REPLACE FUNCTION public.get_community_top_members(_limit integer DEFAULT 10)
 RETURNS TABLE(user_id uuid, name text, avatar_url text, xp integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.name, p.avatar_url, p.xp
  FROM public.profiles p
  WHERE public.is_leaderboard_visible(p.user_id)
  ORDER BY p.xp DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 100));
$function$;