-- Trigger functions are invoked by their attached triggers, not exposed as client RPCs.
-- Revoke direct execution while preserving the triggers themselves.
REVOKE ALL ON FUNCTION public.enforce_free_habit_limit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_free_habit_update_lock() FROM PUBLIC, anon, authenticated, service_role;
