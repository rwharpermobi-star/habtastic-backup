
CREATE TABLE public.community_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  platform text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_community_clicks_platform_created ON public.community_clicks(platform, created_at DESC);
CREATE INDEX idx_community_clicks_user ON public.community_clicks(user_id);

ALTER TABLE public.community_clicks ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or auth) may insert a click
CREATE POLICY "Anyone can record community clicks"
ON public.community_clicks
FOR INSERT
TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Users can view their own clicks
CREATE POLICY "Users can view own community clicks"
ON public.community_clicks
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
