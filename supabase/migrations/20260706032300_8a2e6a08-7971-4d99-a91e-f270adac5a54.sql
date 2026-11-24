-- Drop duplicate/redundant indexes identified via pg_indexes audit.
-- Each DROP keeps the equivalent or wider covering index in place.

-- ai_challenges: (user_id,status) is a prefix of (user_id,status,end_date DESC)
DROP INDEX IF EXISTS public.idx_ai_challenges_user_status;

-- ai_daily_coaching: duplicate of ai_daily_coaching_user_date_idx
DROP INDEX IF EXISTS public.idx_ai_daily_coaching_user_date;

-- chat_messages: (user_id,coach_id,created_at) covered by user_coach_created DESC
DROP INDEX IF EXISTS public.idx_chat_messages_user_coach;

-- coin_transactions: exact duplicates
DROP INDEX IF EXISTS public.idx_coin_tx_user_created;
DROP INDEX IF EXISTS public.idx_coin_tx_user_reason_date;

-- community_feed: exact duplicates / prefix-covered
DROP INDEX IF EXISTS public.idx_community_feed_created;
DROP INDEX IF EXISTS public.idx_community_feed_user;

-- friendships: single-column prefix of (col,status)
DROP INDEX IF EXISTS public.friendships_requester_idx;
DROP INDEX IF EXISTS public.friendships_addressee_idx;

-- notifications: duplicate of notifications_user_created_idx
DROP INDEX IF EXISTS public.idx_notifications_user;

-- push_subscriptions: duplicates of the unique + user_idx
DROP INDEX IF EXISTS public.idx_push_subscriptions_endpoint;
DROP INDEX IF EXISTS public.idx_push_subscriptions_user;

-- Task 2: race-proof one-shot referral signup coins guard
-- Clean any historical duplicates first, keeping the earliest row.
DELETE FROM public.coin_transactions ct
USING (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY (metadata->>'referral_id')
      ORDER BY created_at ASC, id ASC
    ) AS rn
    FROM public.coin_transactions
    WHERE reason = 'referral_signup'
      AND metadata ? 'referral_id'
  ) s WHERE rn > 1
) dup
WHERE ct.id = dup.id;

CREATE UNIQUE INDEX IF NOT EXISTS coin_tx_referral_signup_once
  ON public.coin_transactions ((metadata->>'referral_id'))
  WHERE reason = 'referral_signup';
