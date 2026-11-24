CREATE OR REPLACE FUNCTION public.temp_set_nonpremium()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET is_premium = false, premium_until = NULL, updated_at = now() WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';
END;
$$;
SELECT public.temp_set_nonpremium();
DROP FUNCTION public.temp_set_nonpremium();