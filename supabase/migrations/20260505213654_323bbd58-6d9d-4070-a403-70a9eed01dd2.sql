CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _avatar text;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'preferred_username',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'Hero'
  );
  _avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.profiles (user_id, name, avatar_url, trial_started_at)
  VALUES (NEW.id, _name, _avatar, now())
  ON CONFLICT (user_id) DO UPDATE
    SET
      name = CASE WHEN public.profiles.name IS NULL OR public.profiles.name = 'Hero'
                  THEN EXCLUDED.name ELSE public.profiles.name END,
      avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists on auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- Ensure unique constraint to support ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;