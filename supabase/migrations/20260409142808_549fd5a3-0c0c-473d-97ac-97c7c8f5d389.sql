DROP TABLE IF EXISTS public._test_migration;

DO $$
DECLARE
  _count int;
BEGIN
  -- Check row exists
  SELECT count(*) INTO _count FROM public.profiles WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';
  RAISE NOTICE 'Rows found: %', _count;
  
  UPDATE public.profiles SET is_premium = false, premium_until = NULL 
  WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';
  
  GET DIAGNOSTICS _count = ROW_COUNT;
  RAISE NOTICE 'Rows updated: %', _count;
  
  -- Verify
  SELECT is_premium::int INTO _count FROM public.profiles WHERE user_id = '2b8320ad-b1bc-42d9-9cc9-7c5e124fc2c0';
  RAISE NOTICE 'is_premium after update: %', _count;
END;
$$;