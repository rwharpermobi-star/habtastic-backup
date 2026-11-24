
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ EARNINGS LEDGER ============
CREATE TABLE public.user_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('pending','available','paid','reversed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_earnings_user_idx ON public.user_earnings(user_id, created_at DESC);
GRANT SELECT ON public.user_earnings TO authenticated;
GRANT ALL ON public.user_earnings TO service_role;
ALTER TABLE public.user_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own earnings" ON public.user_earnings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ BANK ACCOUNTS ============
CREATE TABLE public.bank_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL,
  bank_name text NOT NULL,
  account_number_encrypted bytea NOT NULL,
  account_number_last4 text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('savings','cheque','business')),
  branch_code text NOT NULL,
  country text NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- No direct grants to authenticated: reads go through masked RPC, writes through save RPC (service_role).
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct client access" ON public.bank_accounts
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ============ BANKING AUDIT LOG ============
CREATE TABLE public.banking_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX banking_audit_user_idx ON public.banking_audit_log(user_id, created_at DESC);
GRANT SELECT ON public.banking_audit_log TO authenticated;
GRANT ALL ON public.banking_audit_log TO service_role;
ALTER TABLE public.banking_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own banking audit" ON public.banking_audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ PAYOUT REQUESTS ============
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','rejected')),
  bank_snapshot jsonb NOT NULL,
  admin_note text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_requests_user_idx ON public.payout_requests(user_id, created_at DESC);
CREATE INDEX payout_requests_status_idx ON public.payout_requests(status, created_at DESC);
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own payouts" ON public.payout_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all payouts" ON public.payout_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payout_requests_touch BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_bank_accounts_touch BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ TRIGGER: referral milestone → earnings ============
CREATE OR REPLACE FUNCTION public.credit_earnings_from_milestone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cents integer;
BEGIN
  -- R10.00 per milestone payout (adjust as needed)
  _cents := 1000;
  INSERT INTO public.user_earnings(user_id, amount_cents, currency, reason, status, metadata)
  VALUES (NEW.user_id, _cents, 'ZAR', 'referral_milestone', 'available',
          jsonb_build_object('milestone_count', NEW.milestone_count));
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_milestone_to_earnings
  AFTER INSERT ON public.referral_milestone_payouts
  FOR EACH ROW EXECUTE FUNCTION public.credit_earnings_from_milestone();

-- ============ RPC: earnings summary ============
CREATE OR REPLACE FUNCTION public.get_my_earnings_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _available int := 0; _pending int := 0; _lifetime int := 0; _paid int := 0;
  _cur text := 'ZAR';
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'available'), 0),
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0),
    COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('available','pending','paid')), 0),
    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)
  INTO _available, _pending, _lifetime, _paid
  FROM public.user_earnings WHERE user_id = _uid;

  -- Subtract pending/processing payout holds from available
  SELECT _available - COALESCE(SUM(amount_cents), 0)
    FROM public.payout_requests
    WHERE user_id = _uid AND status IN ('pending','processing')
    INTO _available;
  _available := GREATEST(_available, 0);

  RETURN jsonb_build_object(
    'available_cents', _available,
    'pending_cents', _pending,
    'lifetime_cents', _lifetime,
    'paid_cents', _paid,
    'currency', _cur,
    'min_payout_cents', 5000
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_earnings_summary() TO authenticated;

-- ============ RPC: masked bank account ============
CREATE OR REPLACE FUNCTION public.get_my_bank_account_masked()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.bank_accounts%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _row FROM public.bank_accounts WHERE user_id = _uid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'account_holder_name', _row.account_holder_name,
    'bank_name', _row.bank_name,
    'account_number_masked', '•••• •••• ' || _row.account_number_last4,
    'account_number_last4', _row.account_number_last4,
    'account_type', _row.account_type,
    'branch_code', _row.branch_code,
    'country', _row.country,
    'currency', _row.currency,
    'updated_at', _row.updated_at
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_bank_account_masked() TO authenticated;

-- ============ RPC: save bank account (service_role only; called from edge fn) ============
CREATE OR REPLACE FUNCTION public.save_bank_account(
  _user_id uuid,
  _holder text, _bank text, _account_number text, _account_type text,
  _branch_code text, _country text, _currency text, _key text,
  _ip text DEFAULT NULL, _ua text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_service boolean;
  _digits text;
  _last4 text;
BEGIN
  _is_service := (
    session_user IN ('service_role','supabase_admin','postgres')
    OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role','') = 'service_role'
  );
  IF NOT _is_service THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id IS NULL OR _key IS NULL OR length(_key) < 16 THEN RAISE EXCEPTION 'invalid_args'; END IF;

  _digits := regexp_replace(COALESCE(_account_number,''), '\D', '', 'g');
  IF length(_digits) < 4 THEN RAISE EXCEPTION 'invalid_account_number'; END IF;
  _last4 := right(_digits, 4);

  INSERT INTO public.bank_accounts(
    user_id, account_holder_name, bank_name, account_number_encrypted,
    account_number_last4, account_type, branch_code, country, currency
  ) VALUES (
    _user_id, btrim(_holder), btrim(_bank),
    pgp_sym_encrypt(_digits, _key),
    _last4, lower(_account_type), btrim(_branch_code), btrim(_country), upper(_currency)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    account_holder_name = EXCLUDED.account_holder_name,
    bank_name = EXCLUDED.bank_name,
    account_number_encrypted = EXCLUDED.account_number_encrypted,
    account_number_last4 = EXCLUDED.account_number_last4,
    account_type = EXCLUDED.account_type,
    branch_code = EXCLUDED.branch_code,
    country = EXCLUDED.country,
    currency = EXCLUDED.currency,
    updated_at = now();

  INSERT INTO public.banking_audit_log(user_id, action, ip, user_agent, metadata)
  VALUES (_user_id, 'bank_account_saved', _ip, _ua,
          jsonb_build_object('bank', btrim(_bank), 'last4', _last4));
END; $$;
REVOKE ALL ON FUNCTION public.save_bank_account(uuid,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_bank_account(uuid,text,text,text,text,text,text,text,text,text,text) TO service_role;

-- ============ RPC: request payout ============
CREATE OR REPLACE FUNCTION public.request_payout(_amount_cents integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _bank public.bank_accounts%ROWTYPE;
  _summary jsonb;
  _available int;
  _min int := 5000;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount_cents IS NULL OR _amount_cents < _min THEN RAISE EXCEPTION 'amount_below_minimum'; END IF;

  SELECT * INTO _bank FROM public.bank_accounts WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank_account_missing'; END IF;

  _summary := public.get_my_earnings_summary();
  _available := (_summary->>'available_cents')::int;
  IF _amount_cents > _available THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO public.payout_requests(user_id, amount_cents, currency, bank_snapshot)
  VALUES (_uid, _amount_cents, _bank.currency, jsonb_build_object(
    'account_holder_name', _bank.account_holder_name,
    'bank_name', _bank.bank_name,
    'last4', _bank.account_number_last4,
    'account_type', _bank.account_type,
    'branch_code', _bank.branch_code,
    'country', _bank.country
  )) RETURNING id INTO _id;

  INSERT INTO public.banking_audit_log(user_id, action, metadata)
  VALUES (_uid, 'payout_requested', jsonb_build_object('payout_id', _id, 'amount_cents', _amount_cents));

  RETURN _id;
END; $$;
GRANT EXECUTE ON FUNCTION public.request_payout(integer) TO authenticated;

-- ============ RPC: admin process payout ============
CREATE OR REPLACE FUNCTION public.admin_process_payout(_payout_id uuid, _action text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.payout_requests%ROWTYPE;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _action NOT IN ('approve','reject','mark_paid','mark_failed') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  SELECT * INTO _req FROM public.payout_requests WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _action = 'approve' THEN
    UPDATE public.payout_requests SET status='processing', admin_note=_note, processed_by=_uid, processed_at=now() WHERE id=_payout_id;
  ELSIF _action = 'reject' THEN
    UPDATE public.payout_requests SET status='rejected', admin_note=_note, processed_by=_uid, processed_at=now() WHERE id=_payout_id;
  ELSIF _action = 'mark_paid' THEN
    UPDATE public.payout_requests SET status='paid', admin_note=COALESCE(_note, admin_note), processed_by=_uid, processed_at=now() WHERE id=_payout_id;
    -- Debit ledger
    INSERT INTO public.user_earnings(user_id, amount_cents, currency, reason, status, metadata)
    VALUES (_req.user_id, -_req.amount_cents, _req.currency, 'payout_paid', 'paid',
            jsonb_build_object('payout_id', _payout_id));
  ELSIF _action = 'mark_failed' THEN
    UPDATE public.payout_requests SET status='failed', admin_note=_note, processed_by=_uid, processed_at=now() WHERE id=_payout_id;
  END IF;

  INSERT INTO public.banking_audit_log(user_id, action, metadata)
  VALUES (_req.user_id, 'payout_' || _action, jsonb_build_object('payout_id', _payout_id, 'by', _uid, 'note', _note));
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text) TO authenticated;
