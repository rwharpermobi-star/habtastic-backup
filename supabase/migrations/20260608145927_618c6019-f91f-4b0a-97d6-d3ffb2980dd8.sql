
-- =============================================================
-- Phase 9.3 Critical Pack: gems RPCs + performance indexes
-- =============================================================

-- ---------- C4: server-authoritative gems ledger ----------
CREATE TABLE IF NOT EXISTS public.gem_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gem_transactions TO authenticated;
GRANT ALL ON public.gem_transactions TO service_role;

ALTER TABLE public.gem_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read their own gem transactions"
    ON public.gem_transactions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS gem_transactions_user_created_idx
  ON public.gem_transactions (user_id, created_at DESC);

-- award_gems with per-reason daily caps
CREATE OR REPLACE FUNCTION public.award_gems(
  _user_id uuid, _amount int, _reason text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _current int;
  _today_total int;
  _cap int;
  _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN 0; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _cap := CASE _reason
    WHEN 'weekly_consistency' THEN 5
    WHEN 'challenge_complete' THEN 20
    WHEN 'level_up'           THEN 10
    WHEN 'surprise_reward'    THEN 10
    WHEN 'purchase'           THEN NULL
    ELSE NULL
  END;

  IF _cap IS NOT NULL THEN
    SELECT COALESCE(SUM(delta),0) INTO _today_total
    FROM public.gem_transactions
    WHERE user_id=_user_id AND reason=_reason
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;
    IF _today_total >= _cap THEN RETURN 0; END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;

  SELECT COALESCE(gems,0) INTO _current FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
  _new_balance := _current + _amount;

  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('gems', _new_balance));

  INSERT INTO public.gem_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, COALESCE(_metadata,'{}'::jsonb), _new_balance);

  RETURN _amount;
END; $$;

CREATE OR REPLACE FUNCTION public.spend_gems(
  _user_id uuid, _amount int, _reason text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _current int; _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT COALESCE(gems,0) INTO _current FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
  IF _current < _amount THEN RETURN false; END IF;
  _new_balance := _current - _amount;
  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('gems', _new_balance));
  INSERT INTO public.gem_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, -_amount, _reason, COALESCE(_metadata,'{}'::jsonb), _new_balance);
  RETURN true;
END; $$;

-- ---------- H1/M3: performance indexes ----------
CREATE INDEX IF NOT EXISTS community_feed_created_idx
  ON public.community_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS community_feed_user_created_idx
  ON public.community_feed (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coin_transactions_user_created_idx
  ON public.coin_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coin_transactions_user_reason_date_idx
  ON public.coin_transactions (user_id, reason, created_at);

CREATE INDEX IF NOT EXISTS xp_transactions_user_created_idx
  ON public.xp_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS xp_transactions_user_reason_date_idx
  ON public.xp_transactions (user_id, reason, created_at);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS weekly_scores_week_score_idx
  ON public.weekly_scores (week_start, growth_score DESC);
CREATE INDEX IF NOT EXISTS weekly_scores_user_week_idx
  ON public.weekly_scores (user_id, week_start DESC);

-- chat_messages: power prune + fetch
CREATE INDEX IF NOT EXISTS chat_messages_user_coach_created_idx
  ON public.chat_messages (user_id, coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_created_idx
  ON public.chat_messages (created_at);

-- ---------- H2: unique referral code ----------
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referral_code_unique_idx
  ON public.referrals (referral_code);
