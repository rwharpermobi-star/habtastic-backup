ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_sensitive_fields;

CREATE OR REPLACE FUNCTION public._temp_downgrade()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET is_premium = false, premium_until = NULL, updated_at = now()
  WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';
END;
$$;

SELECT public._temp_downgrade();
DROP FUNCTION public._temp_downgrade();

ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_sensitive_fields;