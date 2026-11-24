
-- 1. Attach the protect_profile_fields trigger (it exists as a function but has no trigger)
DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();

-- 2. Chat messages: add CHECK constraint for valid roles (ignore if exists)
DO $$ BEGIN
  ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_role_check CHECK (role IN ('user', 'assistant', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Restrict chat_messages INSERT to role='user' only for authenticated users
DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat_messages;
CREATE POLICY "Users can insert own chat messages"
ON public.chat_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'user');

-- 4. Clean up duplicate storage policies on avatars bucket
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
