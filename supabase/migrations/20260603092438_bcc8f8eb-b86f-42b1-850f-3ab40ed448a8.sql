CREATE OR REPLACE FUNCTION public.top_referrers_this_month(_limit int DEFAULT 10)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  paid_referrals bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.referrer_id AS user_id,
    COALESCE(p.name, 'Hero') AS display_name,
    p.avatar_url,
    COUNT(*) AS paid_referrals
  FROM public.referrals r
  LEFT JOIN public.profiles p ON p.user_id = r.referrer_id
  WHERE r.purchase_completed = true
    AND r.redeemed_at >= date_trunc('month', now())
  GROUP BY r.referrer_id, p.name, p.avatar_url
  ORDER BY paid_referrals DESC, r.referrer_id
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
$$;

GRANT EXECUTE ON FUNCTION public.top_referrers_this_month(int) TO authenticated;