CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,
  addressee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined')),
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id),
  CONSTRAINT friendships_unique_pair UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx ON public.friendships(status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their friendships"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can create friend requests"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Addressee can update status"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "Either side can unfriend"
  ON public.friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE TRIGGER friendships_touch_updated
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();