-- 1) updated_at column
ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) de-duplicate tokens (keep newest row per token)
DELETE FROM public.device_tokens d
USING public.device_tokens keep
WHERE d.token = keep.token
  AND (d.last_seen_at, d.id) < (keep.last_seen_at, keep.id);

-- 3) token must be globally unique so onConflict(token) works
ALTER TABLE public.device_tokens
  DROP CONSTRAINT IF EXISTS device_tokens_user_id_token_key;

CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_key
  ON public.device_tokens (token);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx
  ON public.device_tokens (user_id);

-- 4) keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_device_tokens_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS device_tokens_set_updated_at ON public.device_tokens;
CREATE TRIGGER device_tokens_set_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_device_tokens_updated_at();