ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_sensitive_fields;
UPDATE public.profiles SET is_premium = false, premium_until = NULL WHERE id = '6bce87de-101a-4206-9109-2a986a5fff0c';
ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_sensitive_fields;