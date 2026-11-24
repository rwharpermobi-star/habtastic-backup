-- Admin oversight for referrals: manual approval/flagging + list signals

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS admin_status text
    CHECK (admin_status IN ('approved','flagged'))
    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS admin_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz;

-- Admin: list referral signals joined with referral + participants
CREATE OR REPLACE FUNCTION public.admin_list_referral_signals(_limit int DEFAULT 100, _only_risky boolean DEFAULT false)
RETURNS TABLE (
  signal_id uuid,
  referral_id uuid,
  referrer_id uuid,
  referred_id uuid,
  signal_type text,
  weight int,
  metadata jsonb,
  signal_created_at timestamptz,
  referral_code text,
  referrer_name text,
  referred_name text,
  purchase_completed boolean,
  admin_status text,
  risk_score int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.referral_id, s.referrer_id, s.referred_id, s.signal_type,
    s.weight, s.metadata, s.created_at,
    r.referral_code,
    pr.name, pd.name,
    r.purchase_completed, r.admin_status,
    public.referral_risk_score(s.referral_id)
  FROM public.referral_signals s
  LEFT JOIN public.referrals r ON r.id = s.referral_id
  LEFT JOIN public.profiles pr ON pr.user_id = s.referrer_id
  LEFT JOIN public.profiles pd ON pd.user_id = s.referred_id
  WHERE (NOT _only_risky) OR public.referral_risk_score(s.referral_id) >= 50
  ORDER BY s.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1);
END;
$$;

-- Admin: flag or approve a specific referral
CREATE OR REPLACE FUNCTION public.admin_review_referral(_referral_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('approved','flagged') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  UPDATE public.referrals
    SET admin_status = _status,
        admin_notes = _notes,
        admin_reviewed_by = auth.uid(),
        admin_reviewed_at = now()
  WHERE id = _referral_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_referral_signals(int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_referral(uuid, text, text) TO authenticated;