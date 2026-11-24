
-- Journal entries table
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  mood text NOT NULL DEFAULT 'neutral',
  mood_intensity integer NOT NULL DEFAULT 5,
  topics text[] NOT NULL DEFAULT '{}'::text[],
  ai_feedback text,
  is_voice boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own journal entries" ON public.journal_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal entries" ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal entries" ON public.journal_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal entries" ON public.journal_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Journal memory table for AI memory system
CREATE TABLE public.journal_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  memory_type text NOT NULL DEFAULT 'insight',
  content text NOT NULL,
  relevance_score real NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own memories" ON public.journal_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.journal_memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.journal_memories FOR DELETE TO authenticated USING (auth.uid() = user_id);
