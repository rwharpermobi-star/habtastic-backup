
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coach_id text NOT NULL CHECK (coach_id IN ('maya', 'ethan')),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own chat messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat messages"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_chat_messages_user_coach ON public.chat_messages (user_id, coach_id, created_at);
