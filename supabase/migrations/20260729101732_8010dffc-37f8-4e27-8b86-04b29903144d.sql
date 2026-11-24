DROP TABLE IF EXISTS public.profiles CASCADE;

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
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', 'Hero'));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own habits" ON public.habits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own habits" ON public.habits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habits" ON public.habits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own habits" ON public.habits FOR DELETE TO authenticated USING (auth.uid() = user_id);

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own challenges" ON public.challenges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own challenges" ON public.challenges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own challenges" ON public.challenges FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own challenges" ON public.challenges FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS daily_ai_messages integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ai_reset date;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid,
  referral_code text NOT NULL UNIQUE,
  redeemed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  purchase_completed boolean NOT NULL DEFAULT false,
  rewarded boolean NOT NULL DEFAULT false,
  reward_days integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own referrals" ON public.referrals FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "Users can create referrals as referrer" ON public.referrals FOR INSERT TO authenticated WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "Users can redeem referrals" ON public.referrals FOR UPDATE TO authenticated USING (referred_id IS NULL AND referrer_id != auth.uid()) WITH CHECK (auth.uid() = referred_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_freezes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freeze_used_dates text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gems integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlocked_themes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS unlocked_effects text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coach_id text NOT NULL CHECK (coach_id IN ('maya', 'ethan')),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own chat messages" ON public.chat_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND role = 'user');
CREATE POLICY "Users can delete own chat messages" ON public.chat_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_chat_messages_user_coach ON public.chat_messages (user_id, coach_id, created_at);

CREATE TABLE public.journal_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '📁',
  color text NOT NULL DEFAULT 'hsl(27, 100%, 50%)',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_folders TO authenticated;
GRANT ALL ON public.journal_folders TO service_role;
ALTER TABLE public.journal_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own folders" ON public.journal_folders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own folders" ON public.journal_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders" ON public.journal_folders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own folders" ON public.journal_folders FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  mood text NOT NULL DEFAULT 'neutral',
  mood_intensity integer NOT NULL DEFAULT 5,
  topics text[] NOT NULL DEFAULT '{}'::text[],
  ai_feedback text,
  is_voice boolean NOT NULL DEFAULT false,
  folder_id uuid REFERENCES public.journal_folders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own journal entries" ON public.journal_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal entries" ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal entries" ON public.journal_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal entries" ON public.journal_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.journal_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  memory_type text NOT NULL DEFAULT 'insight',
  content text NOT NULL,
  relevance_score real NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_memories TO authenticated;
GRANT ALL ON public.journal_memories TO service_role;
ALTER TABLE public.journal_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own memories" ON public.journal_memories FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.journal_memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memories" ON public.journal_memories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.journal_memories FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.journal_passcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  passcode_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.journal_passcodes TO authenticated;
GRANT ALL ON public.journal_passcodes TO service_role;
ALTER TABLE public.journal_passcodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own passcode" ON public.journal_passcodes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own passcode" ON public.journal_passcodes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own passcode" ON public.journal_passcodes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER DEFAULT 1,
  current_value INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'times',
  frequency TEXT DEFAULT 'weekly',
  status TEXT DEFAULT 'active',
  deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own goals" ON public.goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.goals FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.weekly_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_start DATE NOT NULL,
  summary TEXT NOT NULL,
  habits_completed INTEGER DEFAULT 0,
  total_habits INTEGER DEFAULT 0,
  mood_trend TEXT,
  top_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_week UNIQUE (user_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_summaries TO authenticated;
GRANT ALL ON public.weekly_summaries TO service_role;
ALTER TABLE public.weekly_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own summaries" ON public.weekly_summaries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summaries" ON public.weekly_summaries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own summaries" ON public.weekly_summaries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own summaries" ON public.weekly_summaries FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.shop_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  item_id text NOT NULL,
  item_type text NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.shop_purchases TO authenticated;
GRANT ALL ON public.shop_purchases TO service_role;
ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own purchases" ON public.shop_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchases" ON public.shop_purchases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('role') = 'service_role' OR current_user = 'supabase_admin' OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  NEW.daily_ai_messages := OLD.daily_ai_messages;
  NEW.last_ai_reset := OLD.last_ai_reset;
  NEW.streak_freezes := OLD.streak_freezes;
  NEW.freeze_used_dates := OLD.freeze_used_dates;
  NEW.xp := OLD.xp;
  NEW.coins := OLD.coins;
  NEW.gems := OLD.gems;
  NEW.unlocked_themes := OLD.unlocked_themes;
  NEW.unlocked_effects := OLD.unlocked_effects;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_profile_sensitive_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

CREATE OR REPLACE FUNCTION public.update_profile_internal(_user_id uuid, _updates jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET
    is_premium = COALESCE((_updates->>'is_premium')::boolean, is_premium),
    premium_until = COALESCE((_updates->>'premium_until')::timestamptz, premium_until),
    daily_ai_messages = COALESCE((_updates->>'daily_ai_messages')::int, daily_ai_messages),
    last_ai_reset = COALESCE((_updates->>'last_ai_reset')::date, last_ai_reset),
    streak_freezes = COALESCE((_updates->>'streak_freezes')::int, streak_freezes),
    freeze_used_dates = CASE WHEN _updates ? 'freeze_used_dates' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'freeze_used_dates')) ELSE freeze_used_dates END,
    xp = COALESCE((_updates->>'xp')::int, xp),
    coins = COALESCE((_updates->>'coins')::int, coins),
    gems = COALESCE((_updates->>'gems')::int, gems),
    unlocked_themes = CASE WHEN _updates ? 'unlocked_themes' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'unlocked_themes')) ELSE unlocked_themes END,
    unlocked_effects = CASE WHEN _updates ? 'unlocked_effects' THEN ARRAY(SELECT jsonb_array_elements_text(_updates->'unlocked_effects')) ELSE unlocked_effects END,
    updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_referrer(_referral_id uuid, _days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _referrer_id uuid;
  _already_rewarded boolean;
  _current_premium_until timestamptz;
  _new_premium_until timestamptz;
BEGIN
  SELECT referrer_id, rewarded INTO _referrer_id, _already_rewarded FROM public.referrals WHERE id = _referral_id;
  IF _referrer_id IS NULL THEN RAISE EXCEPTION 'Referral not found'; END IF;
  IF _already_rewarded THEN RETURN; END IF;
  SELECT premium_until INTO _current_premium_until FROM public.profiles WHERE user_id = _referrer_id;
  IF _current_premium_until IS NULL OR _current_premium_until < now() THEN
    _new_premium_until := now() + (_days || ' days')::interval;
  ELSE
    _new_premium_until := _current_premium_until + (_days || ' days')::interval;
  END IF;
  UPDATE public.profiles SET is_premium = true, premium_until = _new_premium_until, updated_at = now() WHERE user_id = _referrer_id;
  UPDATE public.referrals SET rewarded = true, reward_days = _days, redeemed_at = now() WHERE id = _referral_id;
END;
$$;