DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

CREATE POLICY "Avatar images readable by signed-in users"
ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'avatars');