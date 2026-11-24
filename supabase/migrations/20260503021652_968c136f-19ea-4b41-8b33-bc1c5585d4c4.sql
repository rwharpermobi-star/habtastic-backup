DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-dispatcher-every-minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;