-- Secure notification-dispatcher scheduler.
-- The cron credential is generated inside Postgres and stored encrypted in
-- Supabase Vault. No raw credential is committed to source.

DO $$
DECLARE
  sid uuid;
  new_secret text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  SELECT id INTO sid
  FROM vault.secrets
  WHERE name = 'notification_dispatcher_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF sid IS NULL THEN
    PERFORM vault.create_secret(
      new_secret,
      'notification_dispatcher_secret',
      'HabTastic notification dispatcher cron authentication'
    );
  ELSE
    PERFORM vault.update_secret(
      sid,
      new_secret,
      'notification_dispatcher_secret',
      'HabTastic notification dispatcher cron authentication'
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_notification_dispatcher_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notification_dispatcher_secret'
  ORDER BY created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_notification_dispatcher_secret()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_notification_dispatcher_secret()
  TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-minutely');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'notification-dispatcher-minutely',
  '* * * * *',
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
