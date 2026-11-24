-- Per-user lookup indexes. Every RLS policy on these tables filters by
-- user_id = auth.uid(), so without a user_id-leading index each read is a
-- sequential scan that degrades linearly with total row count.

-- Time-ordered per-user lists (feeds, logs, histories)
CREATE INDEX IF NOT EXISTS idx_client_telemetry_user_created ON public.client_telemetry_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_feed_user_created ON public.community_feed (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_feed_comments_user ON public.community_feed_comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_created ON public.journal_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_created ON public.diary_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_tx_user_created ON public.xp_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_created ON public.notification_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user_created ON public.shop_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_user_created ON public.payout_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_created ON public.feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_challenges_user_created ON public.ai_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_winston_challenges_user_created ON public.winston_challenges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_premium_grants_user_created ON public.premium_grants (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paystack_sub_audit_user_created ON public.paystack_subscription_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paystack_webhook_events_user ON public.paystack_webhook_events (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_clicks_user_created ON public.community_clicks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_memories_user_created ON public.journal_memories (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_checkins_user_created ON public.partner_checkins (user_id, created_at DESC);

-- Simple per-user lookups
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals (user_id);
CREATE INDEX IF NOT EXISTS idx_journal_folders_user ON public.journal_folders (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_shop_purchases_user ON public.shop_purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_community_challenge_participants_user ON public.community_challenge_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_community_feed_reactions_user ON public.community_feed_reactions (user_id);

-- Public community feed read path: newest visible posts first.
CREATE INDEX IF NOT EXISTS idx_community_feed_visible_created ON public.community_feed (created_at DESC) WHERE is_hidden = false;

-- rate_limits_ip carried two indexes on the same (ip_address, endpoint,
-- window_start) tuple. It is the hottest write table in the system (every
-- public edge function call inserts a row), so the duplicate was pure
-- write overhead. Keep the DESC variant, which also serves the cleanup scan.
DROP INDEX IF EXISTS public.idx_rate_limits_ip_lookup;