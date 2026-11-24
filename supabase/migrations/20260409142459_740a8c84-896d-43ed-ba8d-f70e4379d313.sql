ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_sensitive_fields;
UPDATE public.profiles SET is_premium = false, premium_until = NULL, updated_at = now() WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';
ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_sensitive_fields;