-- Remove duplicate avatar policies
DROP POLICY IF EXISTS "Users can delete own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own avatars" ON storage.objects;

-- Restrict avatar SELECT to authenticated users (was {public}, allowed anon listing/scraping)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can view avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'avatars');

-- Add missing INSERT WITH CHECK on avatars (was NULL, allowed any authenticated user to overwrite anyone's folder)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);