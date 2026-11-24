CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT
  user_id,
  name,
  avatar_url,
  created_at
FROM public.profiles;

COMMENT ON VIEW public.profiles_public IS
  'Safe projection of profiles for social features. Excludes financial, subscription, currency, XP, and rate-limit fields. Use instead of profiles for friend/social UIs.';