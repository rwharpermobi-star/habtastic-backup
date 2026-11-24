-- Minimal stand-in for the live schema so the referral migration can be tested
-- on a plain local Postgres (see scripts/test-referral-migration.sh).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  name text,
  is_premium boolean NOT NULL DEFAULT false,
  premium_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id),
  referred_id uuid REFERENCES auth.users(id),
  referral_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  purchase_completed boolean NOT NULL DEFAULT false,
  qualified_at timestamptz,
  qualifying_payment_reference text,
  qualifying_provider text,
  rewarded boolean NOT NULL DEFAULT false,
  reward_days integer,
  admin_status text CHECK (admin_status IN ('approved','flagged'))
);

CREATE TABLE public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  milestone integer NOT NULL,
  reward_kind text NOT NULL,
  reward_days integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  premium_until_after timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, milestone)
);
GRANT SELECT ON public.referral_rewards TO authenticated;
CREATE TABLE public.premium_grants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, kind text, title text, body text, payload jsonb);
CREATE TABLE public.xp_log (user_id uuid, amount int, source text, meta jsonb);
CREATE FUNCTION public.award_xp(_user uuid, _amount int, _source text, _meta jsonb) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.xp_log VALUES (_user, _amount, _source, _meta) $$;
CREATE FUNCTION public.has_role(_user uuid, _role text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
