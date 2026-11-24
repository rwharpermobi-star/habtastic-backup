
-- =========================================================
-- BATCH 4: Full remaining schema — payments, notifications,
-- social, community, AI, admin. All frontend references.
-- =========================================================

-- ---------- PAYMENTS & SUBSCRIPTIONS ----------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'paystack',
  provider_customer_id text,
  provider_subscription_code text,
  plan_code text,
  plan_interval text,
  amount numeric,
  currency text,
  status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_payment_date timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub_own_select" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.premium_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL,
  days integer NOT NULL,
  granted_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.premium_grants TO authenticated;
GRANT ALL ON public.premium_grants TO service_role;
ALTER TABLE public.premium_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grants_own_select" ON public.premium_grants FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  image_url text,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_products TO anon, authenticated;
GRANT ALL ON public.shop_products TO service_role;
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read" ON public.shop_products FOR SELECT USING (is_active = true);

CREATE TABLE IF NOT EXISTS public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.shop_products(id),
  paystack_reference text UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_orders TO authenticated;
GRANT ALL ON public.shop_orders TO service_role;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_own_select" ON public.shop_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.paystack_subscription_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.paystack_subscription_audit TO authenticated;
GRANT ALL ON public.paystack_subscription_audit TO service_role;
ALTER TABLE public.paystack_subscription_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_own_select" ON public.paystack_subscription_audit FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.paystack_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  source text,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  idempotency_key text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT ALL ON public.paystack_webhook_events TO service_role;
ALTER TABLE public.paystack_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.paystack_webhook_events_safe AS
SELECT id, user_id, event_type, source, status, error_message, received_at, processed_at, idempotency_key
FROM public.paystack_webhook_events;
GRANT SELECT ON public.paystack_webhook_events_safe TO authenticated;

-- ---------- PAYOUTS / BANKING ----------
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  bank_account_masked text,
  processed_at timestamptz,
  processed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts_own" ON public.payout_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "payouts_admin" ON public.payout_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ---------- NOTIFICATIONS ----------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text,
  app_version text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);
GRANT SELECT ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dt_read_own" ON public.device_tokens FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text,
  auth text,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
GRANT SELECT ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_read_own" ON public.push_subscriptions FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id uuid PRIMARY KEY,
  push_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  daily_reminder_time time,
  quiet_hours_start time,
  quiet_hours_end time,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np_own" ON public.notification_prefs FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text,
  body text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nlog_own" ON public.notification_log FOR SELECT TO authenticated USING (auth.uid()=user_id);

-- ---------- SOCIAL ----------
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr_view" ON public.friendships FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "fr_insert" ON public.friendships FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "fr_update" ON public.friendships FOR UPDATE TO authenticated USING (auth.uid() IN (requester_id, addressee_id));
CREATE POLICY "fr_delete" ON public.friendships FOR DELETE TO authenticated USING (auth.uid() IN (requester_id, addressee_id));

CREATE TABLE IF NOT EXISTS public.friend_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  creator_id uuid NOT NULL,
  opponent_id uuid,
  habit_name text NOT NULL,
  duration_days integer NOT NULL DEFAULT 7,
  start_date date NOT NULL DEFAULT (now()::date),
  status text NOT NULL DEFAULT 'pending',
  creator_progress integer NOT NULL DEFAULT 0,
  opponent_progress integer NOT NULL DEFAULT 0,
  winner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.friend_challenges TO authenticated;
GRANT ALL ON public.friend_challenges TO service_role;
ALTER TABLE public.friend_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc_view" ON public.friend_challenges FOR SELECT TO authenticated USING (auth.uid() IN (creator_id, opponent_id) OR opponent_id IS NULL);
CREATE POLICY "fc_insert" ON public.friend_challenges FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "fc_update" ON public.friend_challenges FOR UPDATE TO authenticated USING (auth.uid() IN (creator_id, opponent_id));

CREATE TABLE IF NOT EXISTS public.accountability_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.accountability_partners TO authenticated;
GRANT ALL ON public.accountability_partners TO service_role;
ALTER TABLE public.accountability_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ap_view" ON public.accountability_partners FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, partner_id));
CREATE POLICY "ap_insert" ON public.accountability_partners FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "ap_update" ON public.accountability_partners FOR UPDATE TO authenticated USING (auth.uid() IN (requester_id, partner_id));

CREATE TABLE IF NOT EXISTS public.partner_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL REFERENCES public.accountability_partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  message text,
  mood text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.partner_checkins TO authenticated;
GRANT ALL ON public.partner_checkins TO service_role;
ALTER TABLE public.partner_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pc_view" ON public.partner_checkins FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.accountability_partners a
    WHERE a.id = partnership_id
      AND a.status = 'accepted'
      AND a.ended_at IS NULL
      AND auth.uid() IN (a.requester_id, a.partner_id)
  )
);
CREATE POLICY "pc_insert" ON public.partner_checkins FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.accountability_partners a
    WHERE a.id = partnership_id
      AND a.status = 'accepted'
      AND a.ended_at IS NULL
      AND auth.uid() IN (a.requester_id, a.partner_id)
  )
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ub_own" ON public.user_blocks FOR ALL TO authenticated USING (auth.uid()=blocker_id) WITH CHECK (auth.uid()=blocker_id);

CREATE TABLE IF NOT EXISTS public.user_mutes (
  muter_id uuid NOT NULL,
  muted_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_mutes TO authenticated;
GRANT ALL ON public.user_mutes TO service_role;
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "um_own" ON public.user_mutes FOR ALL TO authenticated USING (auth.uid()=muter_id) WITH CHECK (auth.uid()=muter_id);

-- ---------- COMMUNITY ----------
CREATE TABLE IF NOT EXISTS public.community_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_feed TO authenticated;
GRANT ALL ON public.community_feed TO service_role;
ALTER TABLE public.community_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cf_view" ON public.community_feed FOR SELECT TO authenticated USING (is_hidden = false);
CREATE POLICY "cf_insert_own" ON public.community_feed FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cf_admin_all" ON public.community_feed FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.community_feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.community_feed(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feed_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.community_feed_reactions TO authenticated;
GRANT ALL ON public.community_feed_reactions TO service_role;
ALTER TABLE public.community_feed_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfr_view" ON public.community_feed_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "cfr_own_write" ON public.community_feed_reactions FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.community_feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.community_feed(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_feed_comments TO authenticated;
GRANT ALL ON public.community_feed_comments TO service_role;
ALTER TABLE public.community_feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfc_view" ON public.community_feed_comments FOR SELECT TO authenticated USING (is_hidden=false OR auth.uid()=user_id);
CREATE POLICY "cfc_insert" ON public.community_feed_comments FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "cfc_admin" ON public.community_feed_comments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.community_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  emoji text DEFAULT '🏆',
  goal_value integer NOT NULL DEFAULT 1,
  reward_coins integer NOT NULL DEFAULT 0,
  reward_xp integer NOT NULL DEFAULT 0,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.community_challenges TO authenticated;
GRANT ALL ON public.community_challenges TO service_role;
ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_view" ON public.community_challenges FOR SELECT TO authenticated USING (is_active=true);

CREATE TABLE IF NOT EXISTS public.community_challenge_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.community_challenge_participants TO authenticated;
GRANT ALL ON public.community_challenge_participants TO service_role;
ALTER TABLE public.community_challenge_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ccp_view" ON public.community_challenge_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "ccp_own_write" ON public.community_challenge_participants FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_own" ON public.community_reports FOR SELECT TO authenticated USING (auth.uid()=reporter_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "cr_insert" ON public.community_reports FOR INSERT TO authenticated WITH CHECK (auth.uid()=reporter_id);
CREATE POLICY "cr_admin_update" ON public.community_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.community_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  destination text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.community_clicks TO anon, authenticated;
GRANT ALL ON public.community_clicks TO service_role;
ALTER TABLE public.community_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clicks_insert" ON public.community_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE VIEW public.community_trending_feed AS
SELECT f.id, f.user_id, f.event_type, f.payload, f.created_at,
       COALESCE((SELECT count(*) FROM public.community_feed_reactions r WHERE r.feed_id=f.id), 0) AS reaction_count
FROM public.community_feed f
WHERE f.is_hidden=false
ORDER BY f.created_at DESC;
GRANT SELECT ON public.community_trending_feed TO authenticated;

-- ---------- AI / WINSTON ----------
CREATE TABLE IF NOT EXISTS public.ai_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  difficulty text DEFAULT 'medium',
  status text NOT NULL DEFAULT 'suggested',
  reward_coins integer NOT NULL DEFAULT 0,
  reward_xp integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_challenges TO authenticated;
GRANT ALL ON public.ai_challenges TO service_role;
ALTER TABLE public.ai_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_ch_own" ON public.ai_challenges FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.ai_daily_coaching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coaching_date date NOT NULL,
  message text NOT NULL,
  tone text DEFAULT 'encouraging',
  engagement_score integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, coaching_date)
);
GRANT SELECT ON public.ai_daily_coaching TO authenticated;
GRANT ALL ON public.ai_daily_coaching TO service_role;
ALTER TABLE public.ai_daily_coaching ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adc_own" ON public.ai_daily_coaching FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.ai_weekly_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  summary text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);
GRANT SELECT ON public.ai_weekly_reviews TO authenticated;
GRANT ALL ON public.ai_weekly_reviews TO service_role;
ALTER TABLE public.ai_weekly_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "awr_own" ON public.ai_weekly_reviews FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.winston_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'suggested',
  reward_coins integer NOT NULL DEFAULT 0,
  reward_xp integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.winston_challenges TO authenticated;
GRANT ALL ON public.winston_challenges TO service_role;
ALTER TABLE public.winston_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wch_own" ON public.winston_challenges FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- ---------- MISC ----------
CREATE TABLE IF NOT EXISTS public.diary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  mood text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diary_entries TO authenticated;
GRANT ALL ON public.diary_entries TO service_role;
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "de_own" ON public.diary_entries FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  category text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb_own" ON public.feedback FOR SELECT TO authenticated USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "fb_insert" ON public.feedback FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.weekly_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  score integer NOT NULL DEFAULT 0,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);
GRANT SELECT, INSERT, UPDATE ON public.weekly_scores TO authenticated;
GRANT ALL ON public.weekly_scores TO service_role;
ALTER TABLE public.weekly_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_view" ON public.weekly_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "ws_own_write" ON public.weekly_scores FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.xp_transactions TO authenticated;
GRANT ALL ON public.xp_transactions TO service_role;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_own" ON public.xp_transactions FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE TABLE IF NOT EXISTS public.client_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.client_telemetry_events TO anon, authenticated;
GRANT ALL ON public.client_telemetry_events TO service_role;
ALTER TABLE public.client_telemetry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cte_insert" ON public.client_telemetry_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "cte_admin_view" ON public.client_telemetry_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.profile_privacy (
  user_id uuid PRIMARY KEY,
  profile_public boolean NOT NULL DEFAULT true,
  show_on_leaderboard boolean NOT NULL DEFAULT true,
  allow_friend_requests boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profile_privacy TO authenticated;
GRANT ALL ON public.profile_privacy TO service_role;
ALTER TABLE public.profile_privacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp_own" ON public.profile_privacy FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

-- MFA is handled exclusively by Supabase Auth native TOTP factors.



-- Extend referrals with code column if missing (already exists in Batch 1)
CREATE OR REPLACE VIEW public.referrals_safe AS
SELECT id, referrer_id, referred_id, referral_code, reward_days, rewarded, purchase_completed, redeemed_at, created_at
FROM public.referrals
WHERE referrer_id = auth.uid() OR referred_id = auth.uid();
GRANT SELECT ON public.referrals_safe TO authenticated;

-- =========================================================
-- RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public.award_xp(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_xp integer;
BEGIN
  IF _user_id <> auth.uid() THEN RETURN 0; END IF;
  UPDATE public.profiles SET xp = xp + _amount, updated_at = now() WHERE user_id = _user_id RETURNING xp INTO new_xp;
  INSERT INTO public.xp_transactions(user_id, delta, reason, metadata, balance_after) VALUES (_user_id, _amount, _reason, _metadata, new_xp);
  RETURN _amount;
END $$;

CREATE OR REPLACE FUNCTION public.redeem_referral(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.referrals; me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('ok',false,'error','unauth'); END IF;
  SELECT * INTO r FROM public.referrals WHERE referral_code = _code LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','invalid_code'); END IF;
  IF r.referrer_id = me THEN RETURN jsonb_build_object('ok',false,'error','self'); END IF;
  IF r.referred_id IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error','already_redeemed'); END IF;
  UPDATE public.referrals SET referred_id = me, redeemed_at = now() WHERE id = r.id;
  RETURN jsonb_build_object('ok',true,'referral_id',r.id);
END $$;

CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.referrals;
BEGIN
  SELECT * INTO r FROM public.referrals WHERE referral_code = _code LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid',false); END IF;
  RETURN jsonb_build_object('valid', r.referred_id IS NULL, 'referrer_id', r.referrer_id);
END $$;

CREATE OR REPLACE FUNCTION public.create_referral_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid := auth.uid(); existing text; new_code text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'unauth'; END IF;
  SELECT referral_code INTO existing FROM public.referrals WHERE referrer_id = me AND referred_id IS NULL LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  new_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 6));
  INSERT INTO public.referrals(referrer_id, referral_code) VALUES (me, new_code);
  RETURN new_code;
END $$;

CREATE OR REPLACE FUNCTION public.top_referrers_this_month()
RETURNS TABLE(user_id uuid, referrals_count bigint) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT referrer_id, count(*)::bigint FROM public.referrals
  WHERE created_at >= date_trunc('month', now()) AND referred_id IS NOT NULL
  GROUP BY referrer_id ORDER BY count(*) DESC LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.accept_ai_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.ai_challenges SET status='accepted' WHERE id=_challenge_id AND user_id=auth.uid();
  RETURN jsonb_build_object('ok', FOUND);
END $$;

CREATE OR REPLACE FUNCTION public.complete_ai_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ai_challenges;
BEGIN
  SELECT * INTO c FROM public.ai_challenges WHERE id=_challenge_id AND user_id=auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  UPDATE public.ai_challenges SET status='completed', completed_at=now() WHERE id=_challenge_id;
  IF c.reward_coins > 0 THEN PERFORM public.award_coins(auth.uid(), c.reward_coins, 'ai_challenge_complete', '{}'::jsonb); END IF;
  IF c.reward_xp > 0 THEN PERFORM public.award_xp(auth.uid(), c.reward_xp, 'ai_challenge_complete', '{}'::jsonb); END IF;
  RETURN jsonb_build_object('ok',true,'coins',c.reward_coins,'xp',c.reward_xp);
END $$;

CREATE OR REPLACE FUNCTION public.complete_winston_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.winston_challenges;
BEGIN
  SELECT * INTO c FROM public.winston_challenges WHERE id=_challenge_id AND user_id=auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  UPDATE public.winston_challenges SET status='completed', completed_at=now() WHERE id=_challenge_id;
  IF c.reward_coins > 0 THEN PERFORM public.award_coins(auth.uid(), c.reward_coins, 'winston_challenge_complete', '{}'::jsonb); END IF;
  IF c.reward_xp > 0 THEN PERFORM public.award_xp(auth.uid(), c.reward_xp, 'winston_challenge_complete', '{}'::jsonb); END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.complete_user_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.challenges;
BEGIN
  SELECT * INTO c FROM public.challenges WHERE id=_challenge_id AND user_id=auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false); END IF;
  IF c.reward_xp > 0 THEN PERFORM public.award_xp(auth.uid(), c.reward_xp, 'challenge_complete', '{}'::jsonb); END IF;
  RETURN jsonb_build_object('ok',true,'xp',c.reward_xp);
END $$;

CREATE OR REPLACE FUNCTION public.respond_partner_request(_partnership_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.accountability_partners SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END, updated_at=now()
  WHERE id=_partnership_id AND partner_id=auth.uid() AND status='pending';
  RETURN jsonb_build_object('ok', FOUND);
END $$;

CREATE OR REPLACE FUNCTION public.join_community_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.community_challenge_participants(challenge_id, user_id) VALUES (_challenge_id, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.update_community_challenge_progress(_challenge_id uuid, _delta integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE goal integer; new_progress integer;
BEGIN
  SELECT goal_value INTO goal FROM public.community_challenges WHERE id=_challenge_id;
  UPDATE public.community_challenge_participants
    SET progress = progress + _delta,
        completed_at = CASE WHEN progress + _delta >= COALESCE(goal, 1) AND completed_at IS NULL THEN now() ELSE completed_at END
    WHERE challenge_id=_challenge_id AND user_id=auth.uid()
    RETURNING progress INTO new_progress;
  RETURN jsonb_build_object('ok', FOUND, 'progress', new_progress);
END $$;

CREATE OR REPLACE FUNCTION public.claim_community_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.community_challenges; p public.community_challenge_participants;
BEGIN
  SELECT * INTO p FROM public.community_challenge_participants WHERE challenge_id=_challenge_id AND user_id=auth.uid();
  IF NOT FOUND OR p.completed_at IS NULL OR p.claimed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false); END IF;
  SELECT * INTO c FROM public.community_challenges WHERE id=_challenge_id;
  UPDATE public.community_challenge_participants SET claimed_at=now() WHERE id=p.id;
  IF c.reward_coins > 0 THEN PERFORM public.award_coins(auth.uid(), c.reward_coins, 'community_challenge', '{}'::jsonb); END IF;
  IF c.reward_xp > 0 THEN PERFORM public.award_xp(auth.uid(), c.reward_xp, 'community_challenge', '{}'::jsonb); END IF;
  RETURN jsonb_build_object('ok',true,'coins',c.reward_coins,'xp',c.reward_xp);
END $$;

CREATE OR REPLACE FUNCTION public.toggle_feed_reaction(_feed_id uuid, _emoji text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existed boolean;
BEGIN
  DELETE FROM public.community_feed_reactions WHERE feed_id=_feed_id AND user_id=auth.uid() AND emoji=_emoji RETURNING true INTO existed;
  IF existed IS TRUE THEN RETURN jsonb_build_object('ok',true,'active',false); END IF;
  INSERT INTO public.community_feed_reactions(feed_id, user_id, emoji) VALUES (_feed_id, auth.uid(), _emoji);
  RETURN jsonb_build_object('ok',true,'active',true);
END $$;

CREATE OR REPLACE FUNCTION public.add_feed_comment(_feed_id uuid, _content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.community_feed_comments(feed_id, user_id, content) VALUES (_feed_id, auth.uid(), _content) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_feed_comment(_comment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.community_feed_comments WHERE id=_comment_id AND user_id=auth.uid();
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.report_content(_target_type text, _target_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.community_reports(reporter_id, target_type, target_id, reason) VALUES (auth.uid(), _target_type, _target_id, _reason) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_block(_target_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existed boolean;
BEGIN
  DELETE FROM public.user_blocks WHERE blocker_id=auth.uid() AND blocked_id=_target_id RETURNING true INTO existed;
  IF existed IS TRUE THEN RETURN false; END IF;
  INSERT INTO public.user_blocks(blocker_id, blocked_id) VALUES (auth.uid(), _target_id);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_mute(_target_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existed boolean;
BEGIN
  DELETE FROM public.user_mutes WHERE muter_id=auth.uid() AND muted_id=_target_id RETURNING true INTO existed;
  IF existed IS TRUE THEN RETURN false; END IF;
  INSERT INTO public.user_mutes(muter_id, muted_id) VALUES (auth.uid(), _target_id);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.unlock_eligible_cosmetics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN jsonb_build_object('unlocked', 0);
END $$;

DROP FUNCTION IF EXISTS public.unequip_cosmetic(text);
CREATE OR REPLACE FUNCTION public.unequip_cosmetic(_slot text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  EXECUTE format('UPDATE public.user_equipped_cosmetics SET %I = NULL, updated_at = now() WHERE user_id = auth.uid()', _slot);
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.prune_my_chat_messages(_keep_last integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deleted integer;
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at DESC) rn
    FROM public.chat_messages WHERE user_id = auth.uid()
  )
  DELETE FROM public.chat_messages WHERE id IN (SELECT id FROM ranked WHERE rn > _keep_last);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END $$;

CREATE OR REPLACE FUNCTION public.submit_weekly_score(_score integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wk date := date_trunc('week', now())::date;
BEGIN
  INSERT INTO public.weekly_scores(user_id, week_start, score) VALUES (auth.uid(), wk, _score)
  ON CONFLICT (user_id, week_start) DO UPDATE SET score = GREATEST(public.weekly_scores.score, EXCLUDED.score);
  RETURN jsonb_build_object('ok', true, 'week_start', wk);
END $$;

CREATE OR REPLACE FUNCTION public.accept_friend_challenge(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.friend_challenges SET opponent_id = auth.uid(), status = 'active', updated_at = now()
  WHERE code = _code AND opponent_id IS NULL AND creator_id <> auth.uid();
  RETURN jsonb_build_object('ok', FOUND);
END $$;

CREATE OR REPLACE FUNCTION public.claim_community_explorer()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.award_coins(auth.uid(), 25, 'community_explorer', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.get_community_top_members(_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, name text, avatar_url text, xp integer) LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT p.user_id, p.name, p.avatar_url, p.xp FROM public.profiles p ORDER BY p.xp DESC LIMIT _limit;
$$;

-- MFA: native Supabase Auth MFA/TOTP only.



-- Payouts / Banking
CREATE OR REPLACE FUNCTION public.get_my_bank_account_masked()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
BEGIN RETURN jsonb_build_object('masked', null); END $$;

CREATE OR REPLACE FUNCTION public.get_my_earnings_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE total_cents integer;
BEGIN
  SELECT COALESCE(SUM(amount_cents), 0) INTO total_cents FROM public.payout_requests WHERE user_id = auth.uid() AND status = 'paid';
  RETURN jsonb_build_object('paid_cents', total_cents, 'currency', 'ZAR');
END $$;

CREATE OR REPLACE FUNCTION public.request_payout(_amount_cents integer, _bank_masked text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.payout_requests(user_id, amount_cents, bank_account_masked) VALUES (auth.uid(), _amount_cents, _bank_masked) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_hide_feed(_feed_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN false; END IF;
  UPDATE public.community_feed SET is_hidden = true WHERE id = _feed_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.admin_hide_comment(_comment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN false; END IF;
  UPDATE public.community_feed_comments SET is_hidden = true WHERE id = _comment_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id uuid, _resolution text DEFAULT 'resolved')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN false; END IF;
  UPDATE public.community_reports SET status = _resolution, resolved_by = auth.uid(), resolved_at = now() WHERE id = _report_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_user_id uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN false; END IF;
  INSERT INTO public.notifications(user_id, kind, title, body, payload)
    VALUES (_user_id, 'suspension', 'Account suspended', _reason, '{}'::jsonb);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_referral_signals(_limit integer DEFAULT 100)
RETURNS TABLE(referral_id uuid, referrer_id uuid, referred_id uuid, created_at timestamptz, purchase_completed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT id, referrer_id, referred_id, created_at, purchase_completed FROM public.referrals ORDER BY created_at DESC LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_referral(_referral_id uuid, _approve boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN false; END IF;
  UPDATE public.referrals SET rewarded = _approve WHERE id = _referral_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.admin_process_payout(_payout_id uuid, _status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN false; END IF;
  UPDATE public.payout_requests SET status = _status, processed_by = auth.uid(), processed_at = now(), updated_at = now() WHERE id = _payout_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public STABLE AS $$
DECLARE total_users integer; premium_users integer; total_habits integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  SELECT count(*) INTO total_users FROM public.profiles;
  SELECT count(*) INTO premium_users FROM public.profiles WHERE is_premium = true;
  SELECT count(*) INTO total_habits FROM public.habits;
  RETURN jsonb_build_object('total_users', total_users, 'premium_users', premium_users, 'total_habits', total_habits);
END $$;
