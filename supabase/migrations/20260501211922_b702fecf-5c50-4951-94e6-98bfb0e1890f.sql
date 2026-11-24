-- Make audio bucket private
UPDATE storage.buckets SET public = false WHERE id = 'audio';

-- Owner-scoped RLS policies on storage.objects for the audio bucket
CREATE POLICY "Users can read own audio files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own audio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own audio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own audio files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);