
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Hero',
  coach_gender TEXT CHECK (coach_gender IN ('male', 'female')),
  xp INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'Hero'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Habits table
CREATE TABLE public.habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '💪',
  color TEXT NOT NULL DEFAULT 'hsl(160, 84%, 50%)',
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'custom')),
  category TEXT NOT NULL DEFAULT 'health' CHECK (category IN ('health', 'mindset', 'work', 'custom')),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  reminder_time TEXT,
  custom_days INTEGER[] DEFAULT '{}',
  completions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own habits" ON public.habits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own habits" ON public.habits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habits" ON public.habits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own habits" ON public.habits FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Challenges table
CREATE TABLE public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  duration INTEGER NOT NULL,
  habit_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  completed_days TEXT[] NOT NULL DEFAULT '{}',
  reward_xp INTEGER NOT NULL DEFAULT 100,
  reward_badge TEXT NOT NULL DEFAULT '🏆',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own challenges" ON public.challenges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own challenges" ON public.challenges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own challenges" ON public.challenges FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own challenges" ON public.challenges FOR DELETE TO authenticated USING (auth.uid() = user_id);
