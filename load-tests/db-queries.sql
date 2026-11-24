-- pgbench-style baseline for the hottest queries identified in the 9.2 audit.
-- Run via:
--   pgbench -h <host> -U postgres -d postgres -c 10 -j 4 -T 60 -f load-tests/db-queries.sql
--
-- The queries here intentionally mirror production access patterns rather
-- than raw SELECT * — they exercise the indexes added in migration H1/H2/M3.

\set uid random(1, 10000)

-- 1. Dashboard profile fetch (cached for 5min in app, but the cold path matters).
SELECT id, display_name, coins, gems, xp, level, current_streak
FROM public.profiles
WHERE id = (SELECT id FROM public.profiles OFFSET :uid LIMIT 1);

-- 2. Community feed first page (cursor pagination, idx_community_feed_created).
SELECT id, user_id, kind, content, created_at
FROM public.community_feed
ORDER BY created_at DESC
LIMIT 20;

-- 3. Leaderboard weekly top 50.
SELECT user_id, score
FROM public.weekly_scores
ORDER BY score DESC
LIMIT 50;

-- 4. Notifications inbox (unread first).
SELECT id, kind, payload, read_at
FROM public.notifications
WHERE user_id = (SELECT id FROM public.profiles OFFSET :uid LIMIT 1)
ORDER BY created_at DESC
LIMIT 25;
