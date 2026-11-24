-- Winston memory: structured behavior tags
CREATE TABLE public.winston_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('excuse', 'pattern', 'goal', 'win', 'preference')),
  value TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_winston_memory_user ON public.winston_memory(user_id, tag_type, weight DESC);

ALTER TABLE public.winston_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own memory" ON public.winston_memory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own memory" ON public.winston_memory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own memory" ON public.winston_memory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own memory" ON public.winston_memory FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Winston challenges: "Challenge Me" prompts
CREATE TABLE public.winston_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'expired')),
  reward_xp INTEGER NOT NULL DEFAULT 25,
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_winston_challenges_user ON public.winston_challenges(user_id, status, created_at DESC);

ALTER TABLE public.winston_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own w-challenges" ON public.winston_challenges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own w-challenges" ON public.winston_challenges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own w-challenges" ON public.winston_challenges FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own w-challenges" ON public.winston_challenges FOR DELETE TO authenticated USING (auth.uid() = user_id);