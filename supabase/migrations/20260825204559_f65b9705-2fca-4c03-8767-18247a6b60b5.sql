-- 1. Level maths (mirrors src/lib/progression.ts)
CREATE OR REPLACE FUNCTION public.xp_to_next_level(_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (round((30 * power(GREATEST(_level, 1), 0.72)) / 5))::int * 5;
$$;

CREATE OR REPLACE FUNCTION public.level_from_xp(_xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE _lvl int := 1; _remaining int := GREATEST(COALESCE(_xp, 0), 0); _cost int;
BEGIN
  WHILE _lvl < 50 LOOP
    _cost := public.xp_to_next_level(_lvl);
    IF _remaining < _cost THEN EXIT; END IF;
    _remaining := _remaining - _cost;
    _lvl := _lvl + 1;
  END LOOP;
  RETURN _lvl;
END $$;

CREATE OR REPLACE FUNCTION public.stars_from_level(_level integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT LEAST(5, GREATEST(0, COALESCE(_level, 1) / 10));
$$;

CREATE OR REPLACE FUNCTION public.stage_from_level(_level integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_level, 1) <= 10 THEN 'Beginner'
    WHEN _level <= 20 THEN 'Builder'
    WHEN _level <= 30 THEN 'Consistent'
    WHEN _level <= 40 THEN 'Driven'
    ELSE 'Master' END;
$$;

-- 2. Reward config (single server-side source of truth)
CREATE OR REPLACE FUNCTION public.level_reward_config()
RETURNS TABLE(level integer, coins integer, cosmetic_id text, streak_savers integer, badge text, label text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT * FROM (VALUES
    (2,    50, NULL,                    0, NULL,        'Starter Coins'),
    (3,     0, 'frame_beginner_glow',   0, NULL,        'Beginner Frame'),
    (5,   150, NULL,                    0, NULL,        'Rare Chest'),
    (7,     0, NULL,                    1, NULL,        'Streak Saver'),
    (9,     0, 'effect_winston_spark',  0, NULL,        'Winston Spark'),
    (10,  300, 'frame_star_bronze',     0, 'Beginner',  '1st Star + Bronze Star Frame'),
    (15,  250, NULL,                    0, NULL,        'Rare Chest'),
    (20,  500, 'frame_star_silver',     0, 'Builder',   '2nd Star + Silver Star Frame'),
    (25,  200, 'effect_builder_aura',   0, NULL,        'Builder Aura'),
    (30,  750, 'frame_star_gold',       1, 'Consistent','3rd Star + Gold Star Frame'),
    (35,  300, NULL,                    1, NULL,        'Coins + Streak Saver'),
    (40, 1000, 'frame_star_platinum',   0, 'Driven',    '4th Star + Platinum Star Frame'),
    (45,  400, 'effect_driven_flame',   0, NULL,        'Driven Flame'),
    (50, 1500, 'crown_master',          2, 'Master',    '5th Star + Master Crown')
  ) AS t(level, coins, cosmetic_id, streak_savers, badge, label);
$$;

-- 3. Cosmetic items for level rewards
INSERT INTO public.cosmetic_items (id, name, category, rarity, price_coins, unlock_rule, is_active)
VALUES
  ('frame_beginner_glow',  'Beginner Glow Frame',  'frame',  'common',    NULL, '{"type":"level","level":3}'::jsonb,  true),
  ('effect_winston_spark', 'Winston Spark',        'effect', 'rare',      NULL, '{"type":"level","level":9}'::jsonb,  true),
  ('frame_star_bronze',    'Bronze Star Frame',    'frame',  'rare',      NULL, '{"type":"level","level":10}'::jsonb, true),
  ('frame_star_silver',    'Silver Star Frame',    'frame',  'rare',      NULL, '{"type":"level","level":20}'::jsonb, true),
  ('effect_builder_aura',  'Builder Aura',         'effect', 'epic',      NULL, '{"type":"level","level":25}'::jsonb, true),
  ('frame_star_gold',      'Gold Star Frame',      'frame',  'epic',      NULL, '{"type":"level","level":30}'::jsonb, true),
  ('frame_star_platinum',  'Platinum Star Frame',  'frame',  'legendary', NULL, '{"type":"level","level":40}'::jsonb, true),
  ('effect_driven_flame',  'Driven Flame',         'effect', 'legendary', NULL, '{"type":"level","level":45}'::jsonb, true),
  ('crown_master',         'Master Crown',         'crown',  'legendary', NULL, '{"type":"level","level":50}'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- 4. Claim ledger
CREATE TABLE IF NOT EXISTS public.level_rewards_claimed (
  user_id uuid NOT NULL,
  level integer NOT NULL,
  rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level)
);

GRANT SELECT ON public.level_rewards_claimed TO authenticated;
GRANT ALL ON public.level_rewards_claimed TO service_role;

ALTER TABLE public.level_rewards_claimed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own level rewards"
  ON public.level_rewards_claimed FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "No client writes to level rewards"
  ON public.level_rewards_claimed FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- 5. Claim RPC — server-derived level, transactional, concurrency-safe
CREATE OR REPLACE FUNCTION public.claim_level_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _xp int;
  _level int;
  _granted jsonb := '[]'::jsonb;
  _r record;
  _coins_actual int;
  _shields int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Lock the profile row: serialises concurrent claims for this user.
  SELECT COALESCE(xp, 0) INTO _xp FROM public.profiles WHERE user_id = _uid FOR UPDATE;
  IF _xp IS NULL THEN RETURN jsonb_build_object('level', 1, 'granted', _granted); END IF;
  _level := public.level_from_xp(_xp);

  -- Only rows actually inserted by THIS statement are paid out.
  FOR _r IN
    WITH inserted AS (
      INSERT INTO public.level_rewards_claimed (user_id, level, rewards)
      SELECT _uid, c.level, jsonb_build_object(
               'coins', c.coins, 'cosmetic_id', c.cosmetic_id,
               'streak_savers', c.streak_savers, 'badge', c.badge, 'label', c.label)
      FROM public.level_reward_config() c
      WHERE c.level <= _level
      ON CONFLICT (user_id, level) DO NOTHING
      RETURNING level
    )
    SELECT c.* FROM public.level_reward_config() c
    JOIN inserted i ON i.level = c.level
    ORDER BY c.level
  LOOP
    _coins_actual := 0;
    IF _r.coins > 0 THEN
      _coins_actual := public.award_coins(_uid, _r.coins, 'level_reward',
        jsonb_build_object('level', _r.level));
    END IF;

    IF _r.cosmetic_id IS NOT NULL THEN
      INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via)
      VALUES (_uid, _r.cosmetic_id, 'level_reward')
      ON CONFLICT DO NOTHING;
    END IF;

    IF _r.streak_savers > 0 THEN
      SELECT COALESCE(streak_freezes, 0) INTO _shields FROM public.profiles WHERE user_id = _uid;
      PERFORM public.update_profile_internal(_uid,
        jsonb_build_object('streak_freezes', _shields + _r.streak_savers));
    END IF;

    _granted := _granted || jsonb_build_object(
      'level', _r.level, 'coins', _coins_actual, 'cosmetic_id', _r.cosmetic_id,
      'streak_savers', _r.streak_savers, 'badge', _r.badge, 'label', _r.label);
  END LOOP;

  RETURN jsonb_build_object(
    'level', _level,
    'stars', public.stars_from_level(_level),
    'stage', public.stage_from_level(_level),
    'granted', _granted);
END $$;

REVOKE ALL ON FUNCTION public.claim_level_rewards() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_level_rewards() TO authenticated;

-- 6. Backfill existing users: mark already-passed levels as claimed, NO payout.
INSERT INTO public.level_rewards_claimed (user_id, level, rewards)
SELECT p.user_id, c.level, '{"backfilled": true}'::jsonb
FROM public.profiles p
CROSS JOIN public.level_reward_config() c
WHERE c.level <= public.level_from_xp(COALESCE(p.xp, 0))
ON CONFLICT (user_id, level) DO NOTHING;

-- 7. Community list: expose derived level/stage/stars (no new private data)
DROP FUNCTION IF EXISTS public.get_community_top_members(integer);
CREATE OR REPLACE FUNCTION public.get_community_top_members(_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, name text, avatar_url text, xp integer, level integer, stage text, stars integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.avatar_url, p.xp,
         public.level_from_xp(p.xp),
         public.stage_from_level(public.level_from_xp(p.xp)),
         public.stars_from_level(public.level_from_xp(p.xp))
  FROM public.profiles p
  WHERE public.is_leaderboard_visible(p.user_id)
  ORDER BY p.xp DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 100));
$$;

-- 8. Public star/level lookup for leaderboard rows (derived only, never raw XP)
CREATE OR REPLACE FUNCTION public.get_progression_for_users(_user_ids uuid[])
RETURNS TABLE(user_id uuid, level integer, stage text, stars integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         public.level_from_xp(p.xp),
         public.stage_from_level(public.level_from_xp(p.xp)),
         public.stars_from_level(public.level_from_xp(p.xp))
  FROM public.profiles p
  WHERE p.user_id = ANY(COALESCE(_user_ids, ARRAY[]::uuid[]))
    AND public.is_leaderboard_visible(p.user_id);
$$;

REVOKE ALL ON FUNCTION public.get_progression_for_users(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_progression_for_users(uuid[]) TO authenticated, anon;