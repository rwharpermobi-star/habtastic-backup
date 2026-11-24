
-- ============ FEED COMMENTS ============
CREATE TABLE public.community_feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid NOT NULL REFERENCES public.community_feed(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.community_feed_comments(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 500),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feed_comments_feed ON public.community_feed_comments(feed_id, created_at);
CREATE INDEX idx_feed_comments_parent ON public.community_feed_comments(parent_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_feed_comments TO authenticated;
GRANT ALL ON public.community_feed_comments TO service_role;
ALTER TABLE public.community_feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read comments" ON public.community_feed_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own comment" ON public.community_feed_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users soft delete own comment" ON public.community_feed_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ REPORTS ============
CREATE TABLE public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('post','comment','user')),
  target_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reporter_id, target_type, target_id)
);
GRANT SELECT, INSERT ON public.community_reports TO authenticated;
GRANT ALL ON public.community_reports TO service_role;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own reports" ON public.community_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);
CREATE POLICY "Users create reports" ON public.community_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- ============ MUTES & BLOCKS ============
CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own blocks" ON public.user_blocks FOR ALL TO authenticated USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

CREATE TABLE public.user_mutes (
  muter_id uuid NOT NULL,
  muted_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_mutes TO authenticated;
GRANT ALL ON public.user_mutes TO service_role;
ALTER TABLE public.user_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mutes" ON public.user_mutes FOR ALL TO authenticated USING (auth.uid() = muter_id) WITH CHECK (auth.uid() = muter_id);

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users mark own read" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Block client inserts notifications" ON public.notifications AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

-- ============ PROFILE PRIVACY ============
CREATE TABLE public.profile_privacy (
  user_id uuid PRIMARY KEY,
  hide_xp boolean NOT NULL DEFAULT false,
  hide_coins boolean NOT NULL DEFAULT false,
  hide_streak boolean NOT NULL DEFAULT false,
  hide_crowns boolean NOT NULL DEFAULT false,
  hide_badges boolean NOT NULL DEFAULT false,
  hide_wins boolean NOT NULL DEFAULT false,
  hide_referrals boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profile_privacy TO authenticated;
GRANT ALL ON public.profile_privacy TO service_role;
ALTER TABLE public.profile_privacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read privacy" ON public.profile_privacy FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own privacy" ON public.profile_privacy FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ COMMUNITY CHALLENGE REWARD COLS ============
ALTER TABLE public.community_challenges
  ADD COLUMN IF NOT EXISTS reward_crown integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_badge text;

-- Seed examples
INSERT INTO public.community_challenges (kind, title, description, emoji, target_type, target_value, reward_xp, reward_coins, reward_badge, start_date, end_date)
VALUES
  ('daily',   'Daily Spark',     'Complete 3 habits today',              '⚡', 'habits_completed', 3,  30,  5,  'daily_spark',    CURRENT_DATE, CURRENT_DATE),
  ('weekly',  'Streak Warrior',  'Maintain a 7-day streak this week',    '🔥', 'streak_days',      7,  150, 30, 'streak_warrior', CURRENT_DATE, CURRENT_DATE + 7),
  ('monthly', 'Community Champ', 'Earn 2000 XP this month',              '👑', 'xp_earned',        2000,500,100,'community_champ',CURRENT_DATE, CURRENT_DATE + 30)
ON CONFLICT DO NOTHING;

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.add_feed_comment(_feed_id uuid, _parent_id uuid, _content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _author uuid; _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT user_id INTO _author FROM community_feed WHERE id = _feed_id;
  IF _author IS NULL THEN RAISE EXCEPTION 'feed not found'; END IF;
  IF EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = _author AND blocked_id = _uid) THEN
    RAISE EXCEPTION 'blocked';
  END IF;
  INSERT INTO community_feed_comments(feed_id, user_id, parent_id, content)
  VALUES (_feed_id, _uid, _parent_id, btrim(_content)) RETURNING id INTO _new_id;
  -- notify post author (skip if commenting on own post)
  IF _author <> _uid THEN
    INSERT INTO notifications(user_id, kind, title, body, payload)
    VALUES (_author, 'comment', 'New comment on your post', left(_content, 120), jsonb_build_object('feed_id', _feed_id, 'comment_id', _new_id));
  END IF;
  RETURN _new_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_feed_comment(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_feed_comment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE community_feed_comments SET deleted_at = now(), content = '[deleted]'
   WHERE id = _id AND user_id = auth.uid();
END $$;
GRANT EXECUTE ON FUNCTION public.delete_feed_comment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_content(_target_type text, _target_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  INSERT INTO community_reports(reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), _target_type, _target_id, btrim(_reason))
  ON CONFLICT (reporter_id, target_type, target_id) DO UPDATE SET reason = EXCLUDED.reason
  RETURNING id INTO _id;
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.report_content(text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_block(_target uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _exists boolean;
BEGIN
  IF _uid IS NULL OR _uid = _target THEN RAISE EXCEPTION 'invalid'; END IF;
  SELECT EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = _uid AND blocked_id = _target) INTO _exists;
  IF _exists THEN
    DELETE FROM user_blocks WHERE blocker_id = _uid AND blocked_id = _target; RETURN false;
  ELSE
    INSERT INTO user_blocks(blocker_id, blocked_id) VALUES (_uid, _target); RETURN true;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.toggle_block(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_mute(_target uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _exists boolean;
BEGIN
  IF _uid IS NULL OR _uid = _target THEN RAISE EXCEPTION 'invalid'; END IF;
  SELECT EXISTS(SELECT 1 FROM user_mutes WHERE muter_id = _uid AND muted_id = _target) INTO _exists;
  IF _exists THEN
    DELETE FROM user_mutes WHERE muter_id = _uid AND muted_id = _target; RETURN false;
  ELSE
    INSERT INTO user_mutes(muter_id, muted_id) VALUES (_uid, _target); RETURN true;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.toggle_mute(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notifications SET read_at = now() WHERE user_id = auth.uid() AND read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_community_explorer()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _has boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT 'community_explorer' = ANY(unlocked_effects) INTO _has FROM profiles WHERE user_id = _uid;
  IF _has THEN RETURN jsonb_build_object('already', true); END IF;
  UPDATE profiles SET
    xp = xp + 50,
    coins = coins + 10,
    unlocked_effects = array_append(unlocked_effects, 'community_explorer')
  WHERE user_id = _uid;
  INSERT INTO coin_transactions(user_id, delta, reason, balance_after, metadata)
  SELECT _uid, 10, 'community_explorer_reward', coins, '{}'::jsonb FROM profiles WHERE user_id = _uid;
  RETURN jsonb_build_object('xp', 50, 'coins', 10, 'badge', 'community_explorer');
END $$;
GRANT EXECUTE ON FUNCTION public.claim_community_explorer() TO authenticated;

-- ============ VIEWS ============
CREATE OR REPLACE VIEW public.community_trending_feed AS
SELECT f.id, f.user_id, f.event_type, f.payload, f.created_at,
       COALESCE(r.reaction_count, 0) AS reaction_count,
       COALESCE(c.comment_count, 0)  AS comment_count,
       (COALESCE(r.reaction_count,0) + COALESCE(c.comment_count,0) * 2) AS score
FROM community_feed f
LEFT JOIN (SELECT feed_id, COUNT(*) AS reaction_count FROM community_feed_reactions GROUP BY feed_id) r ON r.feed_id = f.id
LEFT JOIN (SELECT feed_id, COUNT(*) AS comment_count  FROM community_feed_comments WHERE deleted_at IS NULL GROUP BY feed_id) c ON c.feed_id = f.id
WHERE f.created_at > now() - interval '48 hours';
GRANT SELECT ON public.community_trending_feed TO authenticated;

CREATE OR REPLACE VIEW public.community_top_members AS
SELECT f.user_id, COUNT(r.id) AS reactions_received
FROM community_feed f
JOIN community_feed_reactions r ON r.feed_id = f.id
WHERE f.created_at > now() - interval '30 days'
GROUP BY f.user_id
ORDER BY reactions_received DESC
LIMIT 10;
GRANT SELECT ON public.community_top_members TO authenticated;
