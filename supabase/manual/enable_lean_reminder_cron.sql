-- Turn the server reminder job back on, every 5 minutes (was every minute).
-- Run this ONLY after:
--   1. migration 20261121060000_lean_notification_dispatcher.sql has run, and
--   2. the notification-dispatcher edge function has been redeployed from main.
-- Kept out of supabase/migrations on purpose so merging the PR does not
-- switch the job on by itself.

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-minutely');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'notification-dispatcher-5min',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://votldorvfuktonwewuhm.supabase.co/functions/v1/notification-cron-gateway',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'notification_dispatcher_secret'
        ORDER BY created_at DESC
        LIMIT 1
      )
    ),
    body := jsonb_build_object('ts', now())
  );
  $job$
);
