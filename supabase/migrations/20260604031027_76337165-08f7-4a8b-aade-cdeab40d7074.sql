
-- 1) Catalog table
CREATE TABLE public.shop_products (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('coin_pack','founder_pack','cosmetic_bundle')),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  usd_cents integer NOT NULL CHECK (usd_cents >= 0),
  coin_amount integer NOT NULL DEFAULT 0,
  bonus_coins integer NOT NULL DEFAULT 0,
  cosmetic_ids text[] NOT NULL DEFAULT '{}',
  badge text,
  is_founder boolean NOT NULL DEFAULT false,
  available_from timestamptz,
  available_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shop_products TO anon, authenticated;
GRANT ALL ON public.shop_products TO service_role;
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active products are public"
  ON public.shop_products FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- 2) Orders table
CREATE TABLE public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text NOT NULL REFERENCES public.shop_products(id),
  paystack_reference text UNIQUE NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','fulfilled','failed','refunded')),
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shop_orders TO authenticated;
GRANT ALL ON public.shop_orders TO service_role;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own orders"
  ON public.shop_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages orders"
  ON public.shop_orders FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX shop_orders_user_idx ON public.shop_orders(user_id, created_at DESC);

-- 3) Allow purchase reasons to flow uncapped through award_coins
CREATE OR REPLACE FUNCTION public.award_coins(_user_id uuid, _amount integer, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _current int;
  _today_total int;
  _cap int;
  _new_balance int;
BEGIN
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN 0;
  END IF;

  _cap := CASE _reason
    WHEN 'welcome'              THEN 100
    WHEN 'daily_login'          THEN 10
    WHEN 'habit_complete'       THEN 100
    WHEN 'all_habits_complete'  THEN 50
    WHEN 'streak_7'             THEN 25
    WHEN 'streak_30'            THEN 50
    WHEN 'streak_100'           THEN 100
    WHEN 'challenge_complete'   THEN 200
    WHEN 'daily_chest'          THEN 100
    WHEN 'referral_signup'      THEN 1000
    WHEN 'referral_milestone'   THEN 10000
    WHEN 'verification'         THEN 50
    WHEN 'reflection'           THEN 10
    WHEN 'celebration'          THEN 500
    -- purchase-driven reasons are uncapped
    WHEN 'coin_pack'            THEN NULL
    WHEN 'founder_pack'         THEN NULL
    WHEN 'first_purchase_bonus' THEN NULL
    ELSE NULL
  END;

  IF _cap IS NOT NULL THEN
    SELECT COALESCE(SUM(delta), 0) INTO _today_total
    FROM public.coin_transactions
    WHERE user_id = _user_id
      AND reason = _reason
      AND created_at::date = (now() AT TIME ZONE 'UTC')::date;

    IF _today_total >= _cap THEN
      RETURN 0;
    END IF;
    _amount := LEAST(_amount, _cap - _today_total);
  END IF;

  IF _reason = 'welcome' THEN
    IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE user_id = _user_id AND reason = 'welcome') THEN
      RETURN 0;
    END IF;
  END IF;

  SELECT COALESCE(coins, 0) INTO _current FROM public.profiles WHERE user_id = _user_id FOR UPDATE;
  _new_balance := _current + _amount;

  PERFORM public.update_profile_internal(_user_id, jsonb_build_object('coins', _new_balance));

  INSERT INTO public.coin_transactions(user_id, delta, reason, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, COALESCE(_metadata, '{}'::jsonb), _new_balance);

  RETURN _amount;
END;
$function$;

-- 4) Fulfilment RPC (idempotent, service-role only)
CREATE OR REPLACE FUNCTION public.fulfill_shop_order(_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_service boolean;
  _order record;
  _product record;
  _total_coins int;
  _cos text;
  _first_purchase boolean;
BEGIN
  _is_service := (current_setting('role', true) = 'service_role'
                  OR current_user = 'supabase_admin'
                  OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role','') = 'service_role');
  IF NOT _is_service THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO _order FROM public.shop_orders WHERE paystack_reference = _reference FOR UPDATE;
  IF _order.id IS NULL THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF _order.status = 'fulfilled' THEN
    RETURN jsonb_build_object('already_fulfilled', true);
  END IF;

  SELECT * INTO _product FROM public.shop_products WHERE id = _order.product_id;
  IF _product.id IS NULL THEN
    RAISE EXCEPTION 'product_missing';
  END IF;

  _total_coins := COALESCE(_product.coin_amount,0) + COALESCE(_product.bonus_coins,0);

  -- First-purchase bonus: 100 coins on user's first ever fulfilled order
  SELECT NOT EXISTS (
    SELECT 1 FROM public.shop_orders
    WHERE user_id = _order.user_id AND status = 'fulfilled' AND id <> _order.id
  ) INTO _first_purchase;

  IF _total_coins > 0 THEN
    PERFORM public.award_coins(
      _order.user_id, _total_coins,
      CASE WHEN _product.is_founder THEN 'founder_pack' ELSE 'coin_pack' END,
      jsonb_build_object('order_id', _order.id, 'product_id', _product.id)
    );
  END IF;

  IF _first_purchase THEN
    PERFORM public.award_coins(_order.user_id, 100, 'first_purchase_bonus',
      jsonb_build_object('order_id', _order.id));
  END IF;

  -- Grant cosmetics
  IF array_length(_product.cosmetic_ids, 1) > 0 THEN
    FOREACH _cos IN ARRAY _product.cosmetic_ids LOOP
      INSERT INTO public.user_cosmetics(user_id, item_id, acquired_via)
      VALUES (_order.user_id, _cos, CASE WHEN _product.is_founder THEN 'founder' ELSE 'purchase' END)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.shop_purchases(user_id, item_id, item_type)
      VALUES (_order.user_id, _cos, 'cosmetic')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.shop_orders
  SET status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  WHERE id = _order.id;

  RETURN jsonb_build_object('already_fulfilled', false, 'coins_awarded', _total_coins, 'first_purchase_bonus', _first_purchase);
END;
$function$;

REVOKE ALL ON FUNCTION public.fulfill_shop_order(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_shop_order(text) TO service_role;

-- 5) Seed founder-exclusive cosmetics (60-day window from now)
INSERT INTO public.cosmetic_items (id, category, name, description, rarity, preview_emoji, preview_color, sort_order, is_active, unlock_rule, available_until)
VALUES
  ('founder_badge_bronze','frame','Bronze Founder Badge','Worn by early supporters of Habtastic.','rare','🥉','hsl(28 80% 55%)', 901, true, '{"type":"founder"}'::jsonb, now() + interval '60 days'),
  ('founder_badge_silver','frame','Silver Founder Badge','A mark of dedicated Habtastic founders.','epic','🥈','hsl(0 0% 75%)',     902, true, '{"type":"founder"}'::jsonb, now() + interval '60 days'),
  ('founder_badge_gold',  'frame','Gold Founder Badge','The highest tier of founder recognition.','legendary','🥇','hsl(45 90% 55%)', 903, true, '{"type":"founder"}'::jsonb, now() + interval '60 days'),
  ('founder_crown',       'hat',  'Founder Crown',     'A regal crown only founders own.','legendary','👑','hsl(45 95% 60%)', 904, true, '{"type":"founder"}'::jsonb, now() + interval '60 days'),
  ('founder_frame',       'frame','Founder Avatar Frame','Glowing border for founder profiles.','epic','🟧','hsl(28 90% 55%)', 905, true, '{"type":"founder"}'::jsonb, now() + interval '60 days'),
  ('founder_glow',        'effect','Founder Glow','Subtle golden glow effect.','epic','✨','hsl(45 90% 60%)',   906, true, '{"type":"founder"}'::jsonb, now() + interval '60 days')
ON CONFLICT (id) DO NOTHING;

-- 6) Seed shop catalog
INSERT INTO public.shop_products (id, kind, name, description, usd_cents, coin_amount, bonus_coins, cosmetic_ids, badge, is_founder, available_until, sort_order)
VALUES
  -- Coin Packs
  ('cp_100',   'coin_pack','100 Coins',   'Starter pack',          99,  100,   0, '{}', NULL,           false, NULL, 10),
  ('cp_250',   'coin_pack','250 Coins',   'Great value boost',    199,  250,  25, '{}', NULL,           false, NULL, 20),
  ('cp_500',   'coin_pack','500 Coins',   'Most popular pack',    399,  500,  75, '{}', 'most_popular', false, NULL, 30),
  ('cp_1000',  'coin_pack','1,000 Coins', 'Stock up and save',    699, 1000, 200, '{}', NULL,           false, NULL, 40),
  ('cp_2500',  'coin_pack','2,500 Coins', 'Best value',          1499, 2500, 750, '{}', 'best_value',   false, NULL, 50),
  ('cp_5000',  'coin_pack','5,000 Coins', 'Whale tier',          2599, 5000,2000, '{}', NULL,           false, NULL, 60),

  -- Founder Packs (60-day window)
  ('fp_bronze','founder_pack','Bronze Founder', 'Coins + Bronze Founder Badge.',
     499, 500, 0,  '{founder_badge_bronze}', NULL, true, now() + interval '60 days', 100),
  ('fp_silver','founder_pack','Silver Founder', 'Coins, Silver Badge & Founder Frame.',
     1499, 2000, 0, '{founder_badge_silver,founder_frame}', 'most_popular', true, now() + interval '60 days', 110),
  ('fp_gold',  'founder_pack','Gold Founder',   'Coins, Gold Badge, Founder Crown & Glow.',
     3999, 6000, 0, '{founder_badge_gold,founder_crown,founder_glow,founder_frame}', 'best_value', true, now() + interval '60 days', 120),

  -- Cosmetic Bundles (use existing cosmetic ids; safe to no-op if a referenced cosmetic doesn't exist yet)
  ('cb_starter', 'cosmetic_bundle','Starter Cosmetic Pack', 'A small selection to personalize your avatar.',
     299, 0, 100, '{}', NULL, false, NULL, 200),
  ('cb_premium', 'cosmetic_bundle','Premium Cosmetic Pack', 'A premium curated cosmetic bundle.',
     999, 0, 500, '{}', 'best_value', false, NULL, 210)
ON CONFLICT (id) DO NOTHING;
