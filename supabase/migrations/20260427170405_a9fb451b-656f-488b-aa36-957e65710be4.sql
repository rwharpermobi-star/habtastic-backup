-- Auto-prune old AI chat messages to free memory.
-- Per (user_id, coach_id), keep the most recent 200 messages
-- AND delete anything older than 60 days.

CREATE OR REPLACE FUNCTION public.prune_old_chat_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  age_deleted integer := 0;
  cap_deleted integer := 0;
BEGIN
  -- 1) Hard age cutoff: delete anything older than 60 days
  WITH del AS (
    DELETE FROM public.chat_messages
    WHERE created_at < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*) INTO age_deleted FROM del;

  -- 2) Per-conversation cap: keep newest 200 per (user, coach)
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, coach_id
             ORDER BY created_at DESC
           ) AS rn
    FROM public.chat_messages
  ),
  del AS (
    DELETE FROM public.chat_messages
    WHERE id IN (SELECT id FROM ranked WHERE rn > 200)
    RETURNING 1
  )
  SELECT count(*) INTO cap_deleted FROM del;

  deleted_count := age_deleted + cap_deleted;
  RETURN deleted_count;
END;
$$;

-- Per-user prune callable from the client. Same rules, scoped to auth.uid().
-- Lets the app opportunistically clean up its own old chats on load.
CREATE OR REPLACE FUNCTION public.prune_my_chat_messages(_keep_last integer DEFAULT 200, _max_age_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  deleted_count integer := 0;
  age_deleted integer := 0;
  cap_deleted integer := 0;
  keep_last integer := greatest(coalesce(_keep_last, 200), 20);
  max_age integer := greatest(coalesce(_max_age_days, 60), 7);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH del AS (
    DELETE FROM public.chat_messages
    WHERE user_id = uid
      AND created_at < now() - (max_age || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO age_deleted FROM del;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY coach_id
             ORDER BY created_at DESC
           ) AS rn
    FROM public.chat_messages
    WHERE user_id = uid
  ),
  del AS (
    DELETE FROM public.chat_messages
    WHERE id IN (SELECT id FROM ranked WHERE rn > keep_last)
    RETURNING 1
  )
  SELECT count(*) INTO cap_deleted FROM del;

  deleted_count := age_deleted + cap_deleted;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_my_chat_messages(integer, integer) TO authenticated;

-- Schedule the global prune to run daily at 03:17 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- Remove any prior schedule with the same name to keep this idempotent
  PERFORM cron.unschedule('prune-old-chat-messages')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-old-chat-messages');
EXCEPTION WHEN OTHERS THEN
  -- ignore
  NULL;
END$$;

SELECT cron.schedule(
  'prune-old-chat-messages',
  '17 3 * * *',
  $$SELECT public.prune_old_chat_messages();$$
);