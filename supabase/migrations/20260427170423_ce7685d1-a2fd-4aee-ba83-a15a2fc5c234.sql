-- Restrict execution of the prune functions to only the roles that need them.

-- Global prune: only the postgres role (pg_cron job runs as postgres) can run it.
REVOKE ALL ON FUNCTION public.prune_old_chat_messages() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_old_chat_messages() FROM anon;
REVOKE ALL ON FUNCTION public.prune_old_chat_messages() FROM authenticated;

-- Per-user prune: only signed-in users. Explicitly deny anon and PUBLIC.
REVOKE ALL ON FUNCTION public.prune_my_chat_messages(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_my_chat_messages(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.prune_my_chat_messages(integer, integer) TO authenticated;