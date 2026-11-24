CREATE OR REPLACE FUNCTION public.unequip_cosmetic(_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Fixed allow-list of slots; no SQL is built from caller input.
  CASE _slot
    WHEN 'theme'  THEN UPDATE public.user_equipped_cosmetics SET theme  = NULL, updated_at = now() WHERE user_id = _uid;
    WHEN 'frame'  THEN UPDATE public.user_equipped_cosmetics SET frame  = NULL, updated_at = now() WHERE user_id = _uid;
    WHEN 'crown'  THEN UPDATE public.user_equipped_cosmetics SET crown  = NULL, updated_at = now() WHERE user_id = _uid;
    WHEN 'effect' THEN UPDATE public.user_equipped_cosmetics SET effect = NULL, updated_at = now() WHERE user_id = _uid;
    WHEN 'emote'  THEN UPDATE public.user_equipped_cosmetics SET emote  = NULL, updated_at = now() WHERE user_id = _uid;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_slot');
  END CASE;

  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE EXECUTE ON FUNCTION public.unequip_cosmetic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unequip_cosmetic(text) TO authenticated, service_role;