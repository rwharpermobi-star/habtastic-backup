-- Derive Google Play Premium entitlement from a server-owned, Google-verified
-- subscription row. Client roles cannot insert/update subscriptions, and the
-- authenticated google-play-verify Edge Function never writes profiles directly.

CREATE OR REPLACE FUNCTION public.sync_google_play_profile_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.provider = 'google_play'
     AND COALESCE(NEW.metadata->>'source', '') = 'google_play_rtdn'
     AND COALESCE(NEW.metadata->>'verification_authority', '') = 'google_play_api'
     AND NEW.status IN ('active', 'non-renewing')
     AND NEW.current_period_end IS NOT NULL
     AND NEW.current_period_end > now()
  THEN
    UPDATE public.profiles
       SET is_premium = true,
           premium_until = CASE
             WHEN premium_until IS NULL OR premium_until < NEW.current_period_end
               THEN NEW.current_period_end
             ELSE premium_until
           END,
           updated_at = now()
     WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_google_play_profile_entitlement()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_google_play_profile_entitlement()
  TO service_role;

DROP TRIGGER IF EXISTS subscriptions_sync_google_play_entitlement
  ON public.subscriptions;

CREATE TRIGGER subscriptions_sync_google_play_entitlement
AFTER INSERT OR UPDATE OF provider, status, current_period_end, metadata
ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_google_play_profile_entitlement();
