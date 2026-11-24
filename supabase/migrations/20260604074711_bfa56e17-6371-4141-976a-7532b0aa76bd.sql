
ALTER TABLE public.community_challenges DROP CONSTRAINT IF EXISTS community_challenges_target_type_check;
ALTER TABLE public.community_challenges
  ADD CONSTRAINT community_challenges_target_type_check
  CHECK (target_type IN ('habits_completed','streak_days','xp_earned','referrals','perfect_days','challenge_participation'));

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own roles" ON public.user_roles
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE public.community_feed ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE public.community_feed_comments ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

CREATE OR REPLACE FUNCTION public.check_not_suspended()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _until timestamptz;
BEGIN
  SELECT suspended_until INTO _until FROM profiles WHERE user_id = NEW.user_id;
  IF _until IS NOT NULL AND _until > now() THEN
    RAISE EXCEPTION 'account suspended until %', _until;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_no_susp_comments ON public.community_feed_comments;
CREATE TRIGGER trg_no_susp_comments BEFORE INSERT ON public.community_feed_comments
  FOR EACH ROW EXECUTE FUNCTION public.check_not_suspended();
DROP TRIGGER IF EXISTS trg_no_susp_reacts ON public.community_feed_reactions;
CREATE TRIGGER trg_no_susp_reacts BEFORE INSERT ON public.community_feed_reactions
  FOR EACH ROW EXECUTE FUNCTION public.check_not_suspended();

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_id uuid, _status text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('reviewing','resolved','dismissed') THEN RAISE EXCEPTION 'bad status'; END IF;
  UPDATE community_reports SET status = _status, resolution_notes = _notes,
    resolved_at = CASE WHEN _status IN ('resolved','dismissed') THEN now() ELSE resolved_at END
  WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_hide_feed(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE community_feed SET hidden_at = now() WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_hide_feed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_feed(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_hide_comment(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE community_feed_comments SET hidden_at = now(), content = '[removed by moderator]' WHERE id = _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_hide_comment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hide_comment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_user_id uuid, _hours integer)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _until timestamptz;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _hours IS NULL OR _hours = 0 THEN
    UPDATE profiles SET suspended_until = NULL WHERE user_id = _user_id;
    RETURN NULL;
  END IF;
  _until := now() + make_interval(hours => _hours);
  UPDATE profiles SET suspended_until = _until WHERE user_id = _user_id;
  RETURN _until;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.recalc_user_community_progress(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record; _val int;
BEGIN
  FOR _p IN
    SELECT cp.id, cp.challenge_id, cp.progress, cp.completed_at,
           c.target_type, c.target_value, c.start_date, c.end_date
      FROM community_challenge_participants cp
      JOIN community_challenges c ON c.id = cp.challenge_id
     WHERE cp.user_id = _user_id
       AND c.is_active = true
       AND c.end_date >= CURRENT_DATE
       AND cp.completed_at IS NULL
  LOOP
    _val := 0;
    IF _p.target_type IN ('habits_completed','perfect_days') THEN
      SELECT COUNT(*) INTO _val FROM (
        SELECT unnest(completions) AS d FROM habits WHERE user_id = _user_id
      ) s WHERE s.d::date BETWEEN _p.start_date AND _p.end_date;
    ELSIF _p.target_type = 'streak_days' THEN
      SELECT GREATEST(_p.progress, COALESCE(MAX(array_length(completions,1)),0))
        INTO _val FROM habits WHERE user_id = _user_id;
    ELSIF _p.target_type = 'xp_earned' THEN
      SELECT COALESCE(xp,0) INTO _val FROM profiles WHERE user_id = _user_id;
    ELSIF _p.target_type = 'referrals' THEN
      SELECT COUNT(*) INTO _val FROM referrals
        WHERE referrer_id = _user_id AND purchase_completed = true
          AND COALESCE(redeemed_at, now()) BETWEEN _p.start_date AND _p.end_date + 1;
    END IF;

    UPDATE community_challenge_participants
       SET progress = GREATEST(progress, _val),
           completed_at = CASE WHEN _val >= _p.target_value AND completed_at IS NULL THEN now() ELSE completed_at END
     WHERE id = _p.id;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.recalc_user_community_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_user_community_progress(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_habits_recalc_challenges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(array_length(NEW.completions,1),0) > COALESCE(array_length(OLD.completions,1),0) THEN
    PERFORM public.recalc_user_community_progress(NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_habits_recalc_challenges ON public.habits;
CREATE TRIGGER trg_habits_recalc_challenges AFTER UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.trg_habits_recalc_challenges();

INSERT INTO public.community_challenges (kind, title, description, emoji, target_type, target_value, reward_xp, reward_coins, reward_crown, reward_badge, start_date, end_date)
VALUES
  ('daily',   'Triple Threat',    'Complete 3 habits today',                  '⚡',  'habits_completed', 3,    30,   5,   0, 'triple_threat',    CURRENT_DATE, CURRENT_DATE),
  ('weekly',  'Referral Rally',   'Refer 2 friends who unlock Premium',       '🎁',  'referrals',         2,    300,  100, 1, 'referral_rally',   CURRENT_DATE, CURRENT_DATE + 6),
  ('weekly',  'Iron Habit',       'Complete 14 habits this week',             '🛡',  'habits_completed', 14,   200,  40,  0, 'iron_habit',       CURRENT_DATE, CURRENT_DATE + 6),
  ('monthly', 'Season Sovereign', 'Earn 5000 XP this month',                  '👑',  'xp_earned',         5000, 1000, 250, 1, 'season_sovereign', CURRENT_DATE, CURRENT_DATE + 30)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.community_dau AS
SELECT day::date AS day, COUNT(DISTINCT user_id) AS dau
FROM (
  SELECT created_at AS day, user_id FROM community_feed
  UNION ALL SELECT created_at, user_id FROM community_feed_reactions
  UNION ALL SELECT created_at, user_id FROM community_feed_comments
) x
WHERE day >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
ALTER VIEW public.community_dau SET (security_invoker = on);
GRANT SELECT ON public.community_dau TO authenticated;

CREATE OR REPLACE VIEW public.community_feed_engagement AS
SELECT date_trunc('day', f.created_at)::date AS day,
       COUNT(DISTINCT f.id) AS posts,
       COUNT(DISTINCT r.id) AS reactions,
       COUNT(DISTINCT c.id) AS comments
FROM community_feed f
LEFT JOIN community_feed_reactions r ON r.feed_id = f.id
LEFT JOIN community_feed_comments c  ON c.feed_id = f.id AND c.deleted_at IS NULL
WHERE f.created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
ALTER VIEW public.community_feed_engagement SET (security_invoker = on);
GRANT SELECT ON public.community_feed_engagement TO authenticated;

CREATE OR REPLACE VIEW public.community_challenge_stats AS
SELECT c.id, c.kind, c.title, c.emoji, c.start_date, c.end_date,
       COUNT(p.user_id) FILTER (WHERE p.user_id IS NOT NULL) AS participants,
       COUNT(p.user_id) FILTER (WHERE p.completed_at IS NOT NULL) AS completions
FROM community_challenges c
LEFT JOIN community_challenge_participants p ON p.challenge_id = c.id
WHERE c.is_active = true
GROUP BY c.id ORDER BY c.start_date DESC;
ALTER VIEW public.community_challenge_stats SET (security_invoker = on);
GRANT SELECT ON public.community_challenge_stats TO authenticated;

CREATE OR REPLACE VIEW public.facebook_conversion_stats AS
SELECT date_trunc('day', created_at)::date AS day,
       COUNT(*) AS clicks,
       COUNT(DISTINCT user_id) AS unique_users
FROM community_clicks
WHERE platform = 'facebook' AND created_at >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1 DESC;
ALTER VIEW public.facebook_conversion_stats SET (security_invoker = on);
GRANT SELECT ON public.facebook_conversion_stats TO authenticated;
