-- Harden community leaderboard privacy and bound result size.
-- Preserve the seven-column return contract consumed by the app.
CREATE OR REPLACE FUNCTION public.get_community_top_members(_limit integer DEFAULT 10)
RETURNS TABLE(
  user_id uuid,
  name text,
  avatar_url text,
  xp integer,
  level integer,
  stage text,
  stars integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    p.user_id,
    p.name,
    p.avatar_url,
    p.xp,
    public.level_from_xp(p.xp),
    public.stage_from_level(public.level_from_xp(p.xp)),
    public.stars_from_level(public.level_from_xp(p.xp))
  FROM public.profiles p
  WHERE public.is_leaderboard_visible(p.user_id)
  ORDER BY p.xp DESC, p.user_id
  LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 50);
$function$;

REVOKE ALL ON FUNCTION public.get_community_top_members(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_community_top_members(integer) TO authenticated, service_role;
