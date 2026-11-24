CREATE TABLE public.google_play_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purchase_token text NOT NULL,
  order_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('refund', 'chargeback', 'revoked')),
  granted_period_end timestamptz,
  premium_until_before timestamptz,
  premium_until_after timestamptz,
  premium_removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_play_revocations_order_unique UNIQUE (purchase_token, order_id)
);

GRANT SELECT ON public.google_play_revocations TO authenticated;
GRANT ALL ON public.google_play_revocations TO service_role;

ALTER TABLE public.google_play_revocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view Google Play revocations"
  ON public.google_play_revocations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX google_play_revocations_user_idx ON public.google_play_revocations (user_id, created_at DESC);

-- A refunded/charged-back order must never re-activate Premium, whatever
-- Google reports for it later. A new order (genuine renewal) is unaffected.
CREATE OR REPLACE FUNCTION public.enforce_google_play_revocation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.provider = 'google_play' AND EXISTS (
    SELECT 1 FROM public.google_play_revocations r
    WHERE r.purchase_token = NEW.provider_subscription_code
      AND (
        NULLIF(NEW.metadata->>'latest_order_id', '') IS NULL
        OR r.order_id = NEW.metadata->>'latest_order_id'
      )
  ) THEN
    NEW.status := 'refunded';
    NEW.cancel_at_period_end := true;
    NEW.next_payment_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_google_play_revocation_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subscriptions_enforce_google_play_revocation ON public.subscriptions;
CREATE TRIGGER subscriptions_enforce_google_play_revocation
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.enforce_google_play_revocation_status();

-- Removes exactly the Premium time a refunded Google Play subscription gave.
-- Must be called BEFORE the RTDN upsert so the previously granted period end
-- is still on the subscription row.
CREATE OR REPLACE FUNCTION public.apply_google_play_revocation(
  _user_id uuid,
  _purchase_token text,
  _order_id text,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_has_sub boolean := false;
  v_ledger_id uuid;
  v_granted_end timestamptz;
  v_is_premium boolean;
  v_until timestamptz;
  v_remaining interval;
  v_self_until timestamptz;
  v_other_until timestamptz;
  v_final timestamptz;
  v_removed boolean := false;
BEGIN
  IF _user_id IS NULL OR coalesce(btrim(_purchase_token), '') = '' OR coalesce(btrim(_order_id), '') = '' THEN
    RAISE EXCEPTION 'Invalid Google Play revocation identity' USING ERRCODE = '22023';
  END IF;
  IF _reason NOT IN ('refund', 'chargeback', 'revoked') THEN
    RAISE EXCEPTION 'Invalid Google Play revocation reason' USING ERRCODE = '22023';
  END IF;

  SELECT is_premium, premium_until INTO v_is_premium, v_until
  FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for Google Play revocation';
  END IF;

  SELECT * INTO v_sub FROM public.subscriptions
  WHERE provider = 'google_play' AND provider_subscription_code = _purchase_token
  FOR UPDATE;
  v_has_sub := FOUND;
  IF v_has_sub AND v_sub.user_id IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Google Play revocation account mismatch';
  END IF;

  INSERT INTO public.google_play_revocations (user_id, purchase_token, order_id, reason)
  VALUES (_user_id, _purchase_token, _order_id, _reason)
  ON CONFLICT (purchase_token, order_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NULL THEN
    -- Already processed. A later VOIDED notice can only sharpen the label.
    IF _reason = 'chargeback' THEN
      UPDATE public.google_play_revocations
      SET reason = 'chargeback', updated_at = now()
      WHERE purchase_token = _purchase_token AND order_id = _order_id;
    END IF;
    RETURN jsonb_build_object('applied', false, 'duplicate', true);
  END IF;

  -- Only time this subscription actually granted can be taken back.
  IF v_has_sub
     AND v_sub.status IN ('active', 'non-renewing')
     AND coalesce(v_sub.metadata->>'source', '') = 'google_play_rtdn' THEN
    v_granted_end := v_sub.current_period_end;
  END IF;

  IF v_granted_end IS NOT NULL
     AND v_granted_end > now()
     AND coalesce(v_is_premium, false)
     AND v_until IS NOT NULL            -- NULL = lifetime Premium: never touched
     AND v_until > now() THEN
    v_remaining := v_granted_end - now();
    v_self_until := v_until - v_remaining;   -- keeps bonus days stacked on top
    IF v_self_until <= now() THEN v_self_until := NULL; END IF;

    SELECT max(s.current_period_end) INTO v_other_until
    FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND s.status IN ('active', 'non-renewing')
      AND s.current_period_end > now()
      AND NOT (s.provider = 'google_play' AND s.provider_subscription_code = _purchase_token);

    v_final := greatest(v_self_until, v_other_until);
    v_removed := v_final IS NULL;

    UPDATE public.profiles
    SET is_premium = v_final IS NOT NULL,
        premium_until = v_final,
        updated_at = now()
    WHERE user_id = _user_id;
  ELSE
    v_final := v_until;
  END IF;

  IF v_has_sub THEN
    UPDATE public.subscriptions
    SET status = 'refunded',
        cancel_at_period_end = true,
        next_payment_date = NULL,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'revoked_order_id', _order_id,
          'revocation_reason', _reason,
          'revoked_at', now()
        ),
        updated_at = now()
    WHERE id = v_sub.id;
  END IF;

  UPDATE public.google_play_revocations
  SET granted_period_end = v_granted_end,
      premium_until_before = v_until,
      premium_until_after = v_final,
      premium_removed = v_removed,
      updated_at = now()
  WHERE id = v_ledger_id;

  RETURN jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'premium_removed', v_removed,
    'premium_until_before', v_until,
    'premium_until_after', v_final
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_google_play_revocation(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_google_play_revocation(uuid, text, text, text) TO service_role;