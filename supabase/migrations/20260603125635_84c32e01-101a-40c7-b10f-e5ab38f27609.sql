-- Phase 4: Cosmetic catalog
CREATE TABLE public.cosmetic_items (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('hairstyle','face','accessory','hat','clothing','background','frame','effect')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  rarity text NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  coin_cost integer,
  unlock_rule jsonb NOT NULL DEFAULT '{"type":"purchase"}'::jsonb,
  preview_emoji text NOT NULL DEFAULT '✨',
  preview_color text NOT NULL DEFAULT 'hsl(160 84% 50%)',
  event_id text,
  available_from timestamptz,
  available_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cosmetic_items TO anon, authenticated;
GRANT ALL ON public.cosmetic_items TO service_role;
ALTER TABLE public.cosmetic_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog public read" ON public.cosmetic_items FOR SELECT USING (is_active = true);

-- Ownership
CREATE TABLE public.user_cosmetics (
  user_id uuid NOT NULL,
  item_id text NOT NULL REFERENCES public.cosmetic_items(id) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  acquired_via text NOT NULL DEFAULT 'purchase',
  PRIMARY KEY (user_id, item_id)
);
GRANT SELECT ON public.user_cosmetics TO authenticated;
GRANT ALL ON public.user_cosmetics TO service_role;
ALTER TABLE public.user_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block client writes user_cosmetics" ON public.user_cosmetics FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Users read own cosmetics" ON public.user_cosmetics FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Equipped
CREATE TABLE public.user_equipped_cosmetics (
  user_id uuid PRIMARY KEY,
  hairstyle text REFERENCES public.cosmetic_items(id),
  face text REFERENCES public.cosmetic_items(id),
  accessory text REFERENCES public.cosmetic_items(id),
  hat text REFERENCES public.cosmetic_items(id),
  clothing text REFERENCES public.cosmetic_items(id),
  background text REFERENCES public.cosmetic_items(id),
  frame text REFERENCES public.cosmetic_items(id),
  effect text REFERENCES public.cosmetic_items(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_equipped_cosmetics TO authenticated;
GRANT ALL ON public.user_equipped_cosmetics TO service_role;
ALTER TABLE public.user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block client writes equipped" ON public.user_equipped_cosmetics FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Users read own equipped" ON public.user_equipped_cosmetics FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Leaderboard crowns
CREATE TABLE public.leaderboard_crowns (
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  place integer NOT NULL CHECK (place BETWEEN 1 AND 3),
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_start)
);
GRANT SELECT ON public.leaderboard_crowns TO authenticated;
GRANT ALL ON public.leaderboard_crowns TO service_role;
ALTER TABLE public.leaderboard_crowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Crowns public read" ON public.leaderboard_crowns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Block client writes crowns" ON public.leaderboard_crowns FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- RPCs
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _cost int;
  _active boolean;
  _avail_from timestamptz;
  _avail_until timestamptz;
  _ok boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT coin_cost, is_active, available_from, available_until
    INTO _cost, _active, _avail_from, _avail_until
  FROM public.cosmetic_items WHERE id = _item_id;
  IF NOT FOUND OR NOT _active THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF _cost IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_for_sale'); END IF;
  IF _avail_from IS NOT NULL AND now() < _avail_from THEN RETURN jsonb_build_object('ok',false,'reason','not_yet'); END IF;
  IF _avail_until IS NOT NULL AND now() > _avail_until THEN RETURN jsonb_build_object('ok',false,'reason','expired'); END IF;
  IF EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = _uid AND item_id = _item_id) THEN
    RETURN jsonb_build_object('ok',false,'reason','already_owned');
  END IF;
  _ok := public.spend_coins(_uid, _cost, 'cosmetic_purchase', jsonb_build_object('item_id', _item_id));
  IF NOT _ok THEN RETURN jsonb_build_object('ok',false,'reason','insufficient_coins'); END IF;
  INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via) VALUES (_uid, _item_id, 'purchase');
  RETURN jsonb_build_object('ok',true,'item_id',_item_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.equip_cosmetic(_item_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _cat text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cosmetics WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'Not owned';
  END IF;
  SELECT category INTO _cat FROM public.cosmetic_items WHERE id = _item_id;
  IF _cat IS NULL THEN RAISE EXCEPTION 'Item missing'; END IF;
  INSERT INTO public.user_equipped_cosmetics(user_id) VALUES (_uid) ON CONFLICT (user_id) DO NOTHING;
  EXECUTE format('UPDATE public.user_equipped_cosmetics SET %I = $1, updated_at = now() WHERE user_id = $2', _cat)
    USING _item_id, _uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.unequip_cosmetic(_category text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _category NOT IN ('hairstyle','face','accessory','hat','clothing','background','frame','effect') THEN
    RAISE EXCEPTION 'Invalid category'; END IF;
  EXECUTE format('UPDATE public.user_equipped_cosmetics SET %I = NULL, updated_at = now() WHERE user_id = $1', _category)
    USING _uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_eligible_cosmetics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _item record;
  _granted jsonb := '[]'::jsonb;
  _paid_refs int;
  _xp int;
  _max_streak int := 0;
  _crowns int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COUNT(*) INTO _paid_refs FROM public.referrals WHERE referrer_id = _uid AND purchase_completed = true;
  SELECT xp INTO _xp FROM public.profiles WHERE user_id = _uid;
  SELECT COUNT(*) INTO _crowns FROM public.leaderboard_crowns WHERE user_id = _uid;
  -- best streak proxy: longest run of consecutive completions across habits (cheap: use length of completions array max)
  SELECT COALESCE(MAX(array_length(completions,1)),0) INTO _max_streak FROM public.habits WHERE user_id = _uid;

  FOR _item IN
    SELECT id, unlock_rule FROM public.cosmetic_items
    WHERE is_active = true
      AND id NOT IN (SELECT item_id FROM public.user_cosmetics WHERE user_id = _uid)
      AND (unlock_rule->>'type') <> 'purchase'
  LOOP
    DECLARE _ok boolean := false; _via text := 'grant';
    BEGIN
      CASE _item.unlock_rule->>'type'
        WHEN 'streak'     THEN _ok := _max_streak >= COALESCE((_item.unlock_rule->>'days')::int, 9999); _via := 'streak';
        WHEN 'referrals'  THEN _ok := _paid_refs >= COALESCE((_item.unlock_rule->>'count')::int, 9999); _via := 'referral';
        WHEN 'xp'         THEN _ok := COALESCE(_xp,0) >= COALESCE((_item.unlock_rule->>'amount')::int, 9999);
        WHEN 'leaderboard'THEN _ok := _crowns > 0; _via := 'leaderboard';
        ELSE _ok := false;
      END CASE;
      IF _ok THEN
        INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via)
        VALUES (_uid, _item.id, _via) ON CONFLICT DO NOTHING;
        _granted := _granted || jsonb_build_object('item_id', _item.id);
      END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('granted', _granted);
END;
$$;

CREATE OR REPLACE FUNCTION public.award_monthly_leaderboard_crowns()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _month_start date := date_trunc('month', now() - interval '1 day')::date;
  _row record;
  _place int := 0;
  _crown_item text;
  _awarded jsonb := '[]'::jsonb;
BEGIN
  FOR _row IN
    SELECT user_id, SUM(growth_score) AS score
    FROM public.weekly_scores
    WHERE week_start >= _month_start AND week_start < (_month_start + interval '1 month')
    GROUP BY user_id ORDER BY score DESC LIMIT 3
  LOOP
    _place := _place + 1;
    _crown_item := CASE _place WHEN 1 THEN 'crown_gold' WHEN 2 THEN 'crown_silver' ELSE 'crown_bronze' END;
    INSERT INTO public.leaderboard_crowns(user_id, period_start, place)
    VALUES (_row.user_id, _month_start, _place) ON CONFLICT DO NOTHING;
    INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via)
    VALUES (_row.user_id, _crown_item, 'leaderboard') ON CONFLICT DO NOTHING;
    _awarded := _awarded || jsonb_build_object('user_id', _row.user_id, 'place', _place);
  END LOOP;
  RETURN jsonb_build_object('awarded', _awarded, 'period_start', _month_start);
END;
$$;
