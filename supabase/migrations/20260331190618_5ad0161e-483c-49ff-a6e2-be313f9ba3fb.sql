
-- 1. Update protect_profile_fields to allow service-role / superuser updates
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow superusers and service-role (used by edge functions) to update all fields
  IF current_setting('role') = 'service_role' OR current_user = 'supabase_admin' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  
  -- For regular authenticated users, protect sensitive fields
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  NEW.daily_ai_messages := OLD.daily_ai_messages;
  NEW.last_ai_reset := OLD.last_ai_reset;
  NEW.streak_freezes := OLD.streak_freezes;
  NEW.freeze_used_dates := OLD.freeze_used_dates;
  NEW.xp := OLD.xp;
  RETURN NEW;
END;
$$;

-- 2. Make avatars bucket private
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

-- 3. Drop any existing public SELECT policy on avatars
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- 4. Users can read only their own avatars
CREATE POLICY "Users can read own avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Users can upload to their own folder  
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 6. Users can update their own avatars
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 7. Users can delete their own avatars
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
