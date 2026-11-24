
CREATE TABLE public.friend_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenger_id UUID NOT NULL,
  challenged_id UUID,
  challenge_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  week_start DATE NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.friend_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own challenges"
  ON public.friend_challenges FOR SELECT
  TO authenticated
  USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "Users can create challenges"
  ON public.friend_challenges FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "Users can accept challenges"
  ON public.friend_challenges FOR UPDATE
  TO authenticated
  USING (challenged_id IS NULL OR auth.uid() = challenged_id)
  WITH CHECK (auth.uid() = challenged_id);
