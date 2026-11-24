
-- 1) Admin analytics: revoke public read on the 4 admin-only views.
REVOKE ALL ON public.community_dau              FROM authenticated, anon;
REVOKE ALL ON public.community_feed_engagement  FROM authenticated, anon;
REVOKE ALL ON public.community_challenge_stats  FROM authenticated, anon;
REVOKE ALL ON public.facebook_conversion_stats  FROM authenticated, anon;

-- Admin-gated accessor. SECURITY DEFINER + explicit has_role check.
CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'community_dau',              COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.community_dau d),              '[]'::jsonb),
    'community_feed_engagement',  COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.community_feed_engagement e),  '[]'::jsonb),
    'community_challenge_stats',  COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.community_challenge_stats c),  '[]'::jsonb),
    'facebook_conversion_stats',  COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM public.facebook_conversion_stats f),  '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics() TO authenticated;

-- 2) Paystack webhook events: hide raw_payload from clients. Users can still
-- see status/type/reference/summary etc. for their own rows via existing RLS.
REVOKE SELECT (raw_payload) ON public.paystack_webhook_events FROM authenticated, anon;

-- 3) Referrals: re-apply column-level revoke of fraud/admin fields
-- (idempotent — the earlier migration already did this, but the scanner
--  still lists the finding, so re-run to be explicit).
REVOKE SELECT (signup_ip, device_fingerprint, admin_status, admin_notes, admin_reviewed_by, admin_reviewed_at)
  ON public.referrals FROM authenticated, anon;
