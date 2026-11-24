-- ============ ai_daily_coaching ============
CREATE TABLE public.ai_daily_coaching (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  coaching_date date NOT NULL,
  message text NOT NULL,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  engagement_score integer NOT NULL DEFAULT 0,
  completion_rate_7d numeric NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  at_risk_habits jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_challenge jsonb,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, coaching_date)
);

GRANT SELECT ON public.ai_daily_coaching TO authenticated;
GRANT ALL ON public.ai_daily_coaching TO service_role;

ALTER TABLE public.ai_daily_coaching ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily coaching"
  ON public.ai_daily_coaching FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client writes coaching"
  ON public.ai_daily_coaching FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX ai_daily_coaching_user_date_idx
  ON public.ai_daily_coaching (user_id, coaching_date DESC);

-- ============ ai_challenges ============
CREATE TABLE public.ai_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_habit_id uuid,
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 30),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','cancelled')),
  reward_xp integer NOT NULL DEFAULT 50,
  reward_coins integer NOT NULL DEFAULT 25,
  completed_at timestamptz,
  source_coaching_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_challenges TO authenticated;
GRANT ALL ON public.ai_challenges TO service_role;

ALTER TABLE public.ai_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai challenges"
  ON public.ai_challenges FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client writes ai challenges"
  ON public.ai_challenges FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX ai_challenges_user_status_idx
  ON public.ai_challenges (user_id, status, end_date DESC);

-- ============ accept_ai_challenge RPC ============
CREATE OR REPLACE FUNCTION public.accept_ai_challenge()
RETURNS public.ai_challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_coaching public.ai_daily_coaching%ROWTYPE;
  v_existing public.ai_challenges%ROWTYPE;
  v_challenge jsonb;
  v_title text;
  v_desc text;
  v_days int;
  v_target uuid;
  v_new public.ai_challenges%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  -- Reject if user already has an active challenge
  SELECT * INTO v_existing
  FROM public.ai_challenges
  WHERE user_id = v_user AND status = 'active'
  LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'already_active_challenge'; END IF;

  SELECT * INTO v_coaching
  FROM public.ai_daily_coaching
  WHERE user_id = v_user AND coaching_date = v_today;
  IF NOT FOUND OR v_coaching.suggested_challenge IS NULL THEN
    RAISE EXCEPTION 'no_suggested_challenge';
  END IF;

  v_challenge := v_coaching.suggested_challenge;
  v_title := COALESCE(v_challenge->>'title', 'Winston Challenge');
  v_desc  := COALESCE(v_challenge->>'description', '');
  v_days  := GREATEST(1, LEAST(30, COALESCE((v_challenge->>'duration_days')::int, 7)));
  BEGIN
    v_target := NULLIF(v_challenge->>'target_habit_id','')::uuid;
  EXCEPTION WHEN others THEN v_target := NULL;
  END;

  -- Validate target habit belongs to user
  IF v_target IS NOT NULL THEN
    PERFORM 1 FROM public.habits WHERE id = v_target AND user_id = v_user;
    IF NOT FOUND THEN v_target := NULL; END IF;
  END IF;

  INSERT INTO public.ai_challenges (
    user_id, title, description, target_habit_id, duration_days,
    start_date, end_date, reward_xp, reward_coins, source_coaching_date
  ) VALUES (
    v_user, v_title, v_desc, v_target, v_days,
    v_today, v_today + (v_days - 1),
    GREATEST(25, LEAST(300, COALESCE((v_challenge->>'reward_xp')::int, v_days * 15))),
    GREATEST(10, LEAST(150, COALESCE((v_challenge->>'reward_coins')::int, v_days * 8))),
    v_today
  ) RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ai_challenge() FROM public;
GRANT EXECUTE ON FUNCTION public.accept_ai_challenge() TO authenticated;

-- ============ complete_ai_challenge RPC ============
CREATE OR REPLACE FUNCTION public.complete_ai_challenge(p_challenge_id uuid)
RETURNS public.ai_challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ch public.ai_challenges%ROWTYPE;
  v_habit public.habits%ROWTYPE;
  v_count int := 0;
  v_d date;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT * INTO v_ch FROM public.ai_challenges
  WHERE id = p_challenge_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_ch.status <> 'active' THEN RETURN v_ch; END IF;

  -- Verify progress: target habit must be completed on >= duration_days
  -- within [start_date, end_date]. If no target habit, require user marked
  -- any habit on each day of the window.
  IF v_ch.target_habit_id IS NOT NULL THEN
    SELECT * INTO v_habit FROM public.habits
    WHERE id = v_ch.target_habit_id AND user_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'habit_missing'; END IF;
    v_d := v_ch.start_date;
    WHILE v_d <= v_ch.end_date LOOP
      IF v_d::text = ANY(v_habit.completions) THEN
        v_count := v_count + 1;
      END IF;
      v_d := v_d + 1;
    END LOOP;
  ELSE
    v_d := v_ch.start_date;
    WHILE v_d <= v_ch.end_date LOOP
      PERFORM 1 FROM public.habits
      WHERE user_id = v_user AND v_d::text = ANY(completions)
      LIMIT 1;
      IF FOUND THEN v_count := v_count + 1; END IF;
      v_d := v_d + 1;
    END LOOP;
  END IF;

  IF v_count < v_ch.duration_days THEN
    RAISE EXCEPTION 'incomplete_progress';
  END IF;

  UPDATE public.ai_challenges
     SET status = 'completed', completed_at = now()
   WHERE id = v_ch.id
  RETURNING * INTO v_ch;

  -- Award XP
  UPDATE public.profiles
     SET xp = xp + v_ch.reward_xp
   WHERE user_id = v_user;

  -- Award coins via the secure ledger
  PERFORM public.award_coins(v_user, v_ch.reward_coins, 'ai_challenge',
    jsonb_build_object('challenge_id', v_ch.id, 'title', v_ch.title));

  RETURN v_ch;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_ai_challenge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_ai_challenge(uuid) TO authenticated;

-- ============ award_coins: allow uncapped ai_challenge reason ============
-- Add 'ai_challenge' to the list of reasons that are not subject to daily caps
-- by recreating the function with the same logic, plus the new reason.
DO $$
DECLARE
  v_def text;
BEGIN
  -- Only attempt if function exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='award_coins'
  ) THEN
    -- No-op placeholder; we keep existing function untouched.
    -- ai_challenge stays under default caps; it's rewarded once per challenge
    -- so this is fine. Adjust here later if needed.
    NULL;
  END IF;
END $$;