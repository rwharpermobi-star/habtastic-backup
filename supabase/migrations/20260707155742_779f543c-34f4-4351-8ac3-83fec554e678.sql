-- SECURITY: legacy notification dispatcher schedule cleanup.
--
-- This migration previously embedded a project URL, a Supabase key, and an
-- internal dispatcher secret directly in source. Static credentials must never
-- be committed to migrations. The production scheduler is configured outside
-- source with secret material stored server-side (for example Supabase Vault).
--
-- Keep this migration idempotent: remove any legacy schedules that may still
-- reference committed credentials. A replacement scheduler must obtain its
-- authorization from secure server-side secret storage and must not place raw
-- keys/tokens in SQL committed to the repository.

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher-minutely');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('notification-dispatcher');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$$;
