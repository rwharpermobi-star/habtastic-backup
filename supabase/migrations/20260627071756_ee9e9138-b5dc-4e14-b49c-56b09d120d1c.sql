
-- Hot path: habits list ordered by created_at, filtered by user_id
CREATE INDEX IF NOT EXISTS idx_habits_user_created ON public.habits (user_id, created_at);

-- Hot path: challenges list per user ordered by created_at
CREATE INDEX IF NOT EXISTS idx_challenges_user_created ON public.challenges (user_id, created_at);

-- Hot path: goals list per user ordered by created_at desc
CREATE INDEX IF NOT EXISTS idx_goals_user_created ON public.goals (user_id, created_at DESC);

-- Cosmetic ownership lookups (NOT EXISTS / unlock_eligible_cosmetics joins)
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user ON public.user_cosmetics (user_id);
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user_item ON public.user_cosmetics (user_id, item_id);

-- Retention sweep: nightly DELETE of old telemetry rows
CREATE INDEX IF NOT EXISTS idx_telemetry_created_only ON public.client_telemetry_events (created_at);

-- Webhook idempotency: premium_grants lookups by event id / reference
CREATE INDEX IF NOT EXISTS idx_premium_grants_user ON public.premium_grants (user_id, created_at DESC);

-- Notification dispatcher: efficient unread fetch is covered by partial index already.
-- Rate limit cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits (window_start);

-- Coin/XP/Gem ledger retention scans (already have user_created; add created_at for global sweeps)
CREATE INDEX IF NOT EXISTS idx_coin_tx_created ON public.coin_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_xp_tx_created ON public.xp_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_gem_tx_created ON public.gem_transactions (created_at);

-- Community feed comments lookup by user (moderation)
CREATE INDEX IF NOT EXISTS idx_feed_comments_user ON public.community_feed_comments (user_id, created_at DESC);

-- Friend lookups by status+user for "incoming requests" queries
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status ON public.friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_requester_status ON public.friendships (requester_id, status);

-- Subscription lookup by user + environment + status (Pricing/Premium gates)
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env_status ON public.subscriptions (user_id, environment, status);

-- AI challenges active filter
CREATE INDEX IF NOT EXISTS idx_ai_challenges_user_status ON public.ai_challenges (user_id, status);

-- AI daily coaching lookup
CREATE INDEX IF NOT EXISTS idx_ai_daily_coaching_user_date ON public.ai_daily_coaching (user_id, coaching_date DESC);

-- Mood / reflection per user per day
CREATE INDEX IF NOT EXISTS idx_mood_logs_user_created ON public.mood_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reflections_user_created ON public.daily_reflections (user_id, created_at DESC);

-- Journal entries per user
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_created ON public.journal_entries (user_id, created_at DESC);

-- ANALYZE to refresh planner stats
ANALYZE public.habits;
ANALYZE public.challenges;
ANALYZE public.goals;
ANALYZE public.user_cosmetics;
ANALYZE public.client_telemetry_events;
ANALYZE public.subscriptions;
