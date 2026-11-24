CREATE OR REPLACE FUNCTION public.award_xp(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_xp integer; _caller uuid := auth.uid();
BEGIN
  -- Require authentication and prevent cross-user XP grants
  IF _caller IS NULL OR _caller IS DISTINCT FROM _user_id THEN
    RETURN 0;
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN 0; END IF;
  UPDATE public.profiles SET xp = xp + _amount, updated_at = now() WHERE user_id = _user_id RETURNING xp INTO new_xp;
  IF new_xp IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.xp_transactions(user_id, delta, reason, metadata, balance_after) VALUES (_user_id, _amount, _reason, _metadata, new_xp);
  RETURN _amount;
END $function$;