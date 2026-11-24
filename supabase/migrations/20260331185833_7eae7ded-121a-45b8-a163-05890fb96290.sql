
DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();
