DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;

UPDATE public.profiles 
SET is_premium = false, premium_until = NULL 
WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';

CREATE TRIGGER protect_profile_sensitive_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION protect_profile_fields();