REVOKE ALL ON FUNCTION public.get_progression_for_users(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_progression_for_users(uuid[]) TO authenticated;