-- HabTastic API privilege hardening.
-- RLS remains the row-level boundary; grants are reduced to the minimum API surface.

-- Existing client roles never need schema-management style table privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- New public tables/functions must opt in to Data API access explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Trigger functions are internal implementation details, not client RPCs.
REVOKE EXECUTE ON FUNCTION public.enforce_free_habit_limit()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.ensure_notification_prefs_for_user()
FROM PUBLIC, anon, authenticated;
