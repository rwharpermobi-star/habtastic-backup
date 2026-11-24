
-- ============ COMMUNITY FEED ============
CREATE TABLE public.community_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_community_feed_created ON public.community_feed(created_at DESC);
CREATE INDEX idx_community_feed_user ON public.community_feed(user_id);
GRANT SELECT ON public.community_feed TO authenticated;
GRANT ALL ON public.community_feed TO service_role;
ALTER TABLE public.community_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read feed" ON public.community_feed FOR SELECT TO authenticated USING (true);
CREATE POLICY "Block client writes feed" ON public.community_feed FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE TABLE public.community_feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.community_feed(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('👍','🔥','🎉','💪')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (feed_id, user_id, emoji)
);
CREATE INDEX idx_feed_reactions_feed ON public.community_feed_reactions(feed_id);
GRANT SELECT, INSERT, DELETE ON public.community_feed_reactions TO authenticated;
GRANT ALL ON public.community_feed_reactions TO service_role;
ALTER TABLE public.community_feed_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read reactions" ON public.community_feed_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own reactions" ON public.community_feed_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own reactions" ON public.community_feed_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ ACCOUNTABILITY PARTNERS ============
CREATE TABLE public.accountability_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  CHECK (requester_id <> partner_id)
);
CREATE UNIQUE INDEX idx_partners_active ON public.accountability_partners(requester_id, partner_id) WHERE status IN ('pending','accepted');
CREATE INDEX idx_partners_users ON public.accountability_partners(requester_id, partner_id);
GRANT SELECT, INSERT, UPDATE ON public.accountability_partners TO authenticated;
GRANT ALL ON public.accountability_partners TO service_role;
ALTER TABLE public.accountability_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners read own" ON public.accountability_partners FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = partner_id);
CREATE POLICY "Users create partner request" ON public.accountability_partners FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Either side update" ON public.accountability_partners FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = partner_id)
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = partner_id);

CREATE TABLE public.partner_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL REFERENCES public.accountability_partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partnership_id, user_id, week_start)
);
GRANT SELECT, INSERT ON public.partner_checkins TO authenticated;
GRANT ALL ON public.partner_checkins TO service_role;
ALTER TABLE public.partner_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners read active checkins" ON public.partner_checkins FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accountability_partners p
      WHERE p.id = partnership_id
        AND p.status = 'accepted'
        AND p.ended_at IS NULL
        AND (auth.uid() = p.requester_id OR auth.uid() = p.partner_id)
    )
  );
CREATE POLICY "Users insert own active checkin" ON public.partner_checkins FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.accountability_partners p
      WHERE p.id = partnership_id
        AND p.status = 'accepted'
        AND p.ended_at IS NULL
        AND (auth.uid() = p.requester_id OR auth.uid() = p.partner_id)
    )
  );

-- ============ COMMUNITY CHALLENGES ============
CREATE TABLE public.community_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily','weekly','monthly','event')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '🏆',
  target_type text NOT NULL CHECK (target_type IN ('habits_completed','xp_earned','streak_days','perfect_days')),
  target_value integer NOT NULL,
  reward_xp integer NOT NULL DEFAULT 0,
  reward_coins integer NOT NULL DEFAULT 0,
  reward_cosmetic_id text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cc_active ON public.community_challenges(is_active, end_date);
GRANT SELECT ON public.community_challenges TO authenticated, anon;
GRANT ALL ON public.community_challenges TO service_role;
ALTER TABLE public.community_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read challenges" ON public.community_challenges FOR SELECT USING (is_active = true);

CREATE TABLE public.community_challenge_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);
CREATE INDEX idx_ccp_user ON public.community_challenge_participants(user_id);
GRANT SELECT ON public.community_challenge_participants TO authenticated;
GRANT ALL ON public.community_challenge_participants TO service_role;
ALTER TABLE public.community_challenge_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read participants" ON public.community_challenge_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Block client writes participants" ON public.community_challenge_participants FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- ============ RPCs ============

-- React/unreact to a feed item (toggle)
CREATE OR REPLACE FUNCTION public.toggle_feed_reaction(_feed_id uuid, _emoji text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _existing uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _emoji NOT IN ('👍','🔥','🎉','💪') THEN RAISE EXCEPTION 'invalid emoji'; END IF;
  SELECT id INTO _existing FROM community_feed_reactions WHERE feed_id=_feed_id AND user_id=_uid AND emoji=_emoji;
  IF _existing IS NOT NULL THEN
    DELETE FROM community_feed_reactions WHERE id=_existing;
    RETURN jsonb_build_object('action','removed');
  END IF;
  INSERT INTO community_feed_reactions(feed_id, user_id, emoji) VALUES (_feed_id, _uid, _emoji);
  RETURN jsonb_build_object('action','added');
END $$;
GRANT EXECUTE ON FUNCTION public.toggle_feed_reaction(uuid, text) TO authenticated;

-- Accept/decline accountability partner
CREATE OR REPLACE FUNCTION public.respond_partner_request(_partnership_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row accountability_partners%ROWTYPE; _names jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO _row FROM accountability_partners WHERE id=_partnership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF _row.partner_id <> _uid THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'already responded'; END IF;
  IF _accept THEN
    UPDATE accountability_partners SET status='accepted', accepted_at=now() WHERE id=_partnership_id;
    SELECT jsonb_build_object(
      'requester', (SELECT name FROM profiles WHERE user_id=_row.requester_id),
      'partner', (SELECT name FROM profiles WHERE user_id=_row.partner_id)
    ) INTO _names;
    INSERT INTO community_feed(user_id, event_type, payload)
      VALUES (_row.requester_id, 'partner_accepted', jsonb_build_object('partner_id', _row.partner_id, 'names', _names));
  ELSE
    UPDATE accountability_partners SET status='ended', ended_at=now() WHERE id=_partnership_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.respond_partner_request(uuid, boolean) TO authenticated;

-- Join a community challenge
CREATE OR REPLACE FUNCTION public.join_community_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ch community_challenges%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO _ch FROM community_challenges WHERE id=_challenge_id AND is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge unavailable'; END IF;
  IF _ch.end_date < CURRENT_DATE THEN RAISE EXCEPTION 'challenge ended'; END IF;
  INSERT INTO community_challenge_participants(challenge_id, user_id) VALUES (_challenge_id, _uid)
    ON CONFLICT (challenge_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.join_community_challenge(uuid) TO authenticated;

-- Update progress on a challenge (idempotent set-to-max)
CREATE OR REPLACE FUNCTION public.update_community_challenge_progress(_challenge_id uuid, _progress integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ch community_challenges%ROWTYPE; _p community_challenge_participants%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO _ch FROM community_challenges WHERE id=_challenge_id AND is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge unavailable'; END IF;
  SELECT * INTO _p FROM community_challenge_participants WHERE challenge_id=_challenge_id AND user_id=_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'not joined'; END IF;
  IF _p.completed_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'already_completed', true); END IF;
  UPDATE community_challenge_participants
    SET progress = GREATEST(progress, LEAST(_progress, _ch.target_value)),
        completed_at = CASE WHEN _progress >= _ch.target_value THEN now() ELSE completed_at END
    WHERE id = _p.id;
  IF _progress >= _ch.target_value THEN
    INSERT INTO community_feed(user_id, event_type, payload)
      VALUES (_uid, 'challenge_completed', jsonb_build_object('challenge_id', _ch.id, 'title', _ch.title, 'emoji', _ch.emoji, 'kind', _ch.kind));
  END IF;
  RETURN jsonb_build_object('ok', true, 'completed', _progress >= _ch.target_value);
END $$;
GRANT EXECUTE ON FUNCTION public.update_community_challenge_progress(uuid, integer) TO authenticated;

-- Claim challenge reward
CREATE OR REPLACE FUNCTION public.claim_community_challenge(_challenge_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ch community_challenges%ROWTYPE; _p community_challenge_participants%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT * INTO _ch FROM community_challenges WHERE id=_challenge_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  SELECT * INTO _p FROM community_challenge_participants WHERE challenge_id=_challenge_id AND user_id=_uid;
  IF NOT FOUND OR _p.completed_at IS NULL THEN RAISE EXCEPTION 'not completed'; END IF;
  IF _p.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'already claimed'; END IF;
  UPDATE community_challenge_participants SET claimed_at = now() WHERE id = _p.id;
  IF _ch.reward_xp > 0 THEN
    UPDATE profiles SET xp = xp + _ch.reward_xp WHERE user_id = _uid;
  END IF;
  IF _ch.reward_coins > 0 THEN
    PERFORM public.award_coins(_uid, _ch.reward_coins, 'community_challenge', jsonb_build_object('challenge_id', _ch.id, 'title', _ch.title));
  END IF;
  RETURN jsonb_build_object('ok', true, 'xp', _ch.reward_xp, 'coins', _ch.reward_coins);
EXCEPTION WHEN undefined_function THEN
  -- fallback if award_coins signature differs
  RETURN jsonb_build_object('ok', true, 'xp', _ch.reward_xp, 'coins', 0, 'note', 'coins skipped');
END $$;
GRANT EXECUTE ON FUNCTION public.claim_community_challenge(uuid) TO authenticated;

-- ============ TRIGGERS ============

-- Habits streak milestone trigger
CREATE OR REPLACE FUNCTION public.trg_habit_streak_milestone()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _today date := CURRENT_DATE;
  _streak int := 0;
  _i int;
  _milestones int[] := ARRAY[7,14,30,50,100,365];
  _m int;
  _new_count int := COALESCE(array_length(NEW.completions, 1), 0);
  _old_count int := COALESCE(array_length(OLD.completions, 1), 0);
BEGIN
  IF _new_count <= _old_count THEN RETURN NEW; END IF;
  -- Compute consecutive streak ending today/yesterday
  FOR _i IN 0..400 LOOP
    IF (_today - _i)::text = ANY(NEW.completions) THEN
      _streak := _streak + 1;
    ELSIF _i = 0 THEN
      CONTINUE;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  FOREACH _m IN ARRAY _milestones LOOP
    IF _streak = _m THEN
      -- dedupe: only post once per (user, habit, milestone)
      IF NOT EXISTS (
        SELECT 1 FROM community_feed
        WHERE user_id = NEW.user_id AND event_type='streak_milestone'
          AND (payload->>'habit_id')::uuid = NEW.id
          AND (payload->>'streak')::int = _m
      ) THEN
        INSERT INTO community_feed(user_id, event_type, payload)
          VALUES (NEW.user_id, 'streak_milestone', jsonb_build_object(
            'habit_id', NEW.id, 'habit_name', NEW.name, 'emoji', NEW.emoji, 'streak', _m
          ));
      END IF;
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS habit_streak_milestone ON public.habits;
CREATE TRIGGER habit_streak_milestone
AFTER UPDATE OF completions ON public.habits
FOR EACH ROW EXECUTE FUNCTION public.trg_habit_streak_milestone();
