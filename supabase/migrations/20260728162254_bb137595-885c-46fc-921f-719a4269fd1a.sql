
CREATE TABLE IF NOT EXISTS public.rate_limits_ip (
  ip_key text NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_key, action, window_start)
);
GRANT ALL ON public.rate_limits_ip TO service_role;
ALTER TABLE public.rate_limits_ip ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Block client access rate_limits_ip" ON public.rate_limits_ip;
CREATE POLICY "Block client access rate_limits_ip" ON public.rate_limits_ip
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.rate_limit_check_ip(_ip_key text, _action text, _window_seconds int, _max int)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bucket timestamptz;
  _cur int;
BEGIN
  IF _ip_key IS NULL OR length(_ip_key) = 0 THEN
    _ip_key := 'unknown';
  END IF;
  _bucket := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  INSERT INTO public.rate_limits_ip(ip_key, action, window_start, count)
  VALUES (_ip_key, _action, _bucket, 1)
  ON CONFLICT (ip_key, action, window_start) DO UPDATE SET count = public.rate_limits_ip.count + 1
  RETURNING count INTO _cur;
  IF _cur > _max THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.rate_limit_check_ip(text,text,int,int) FROM public;
GRANT EXECUTE ON FUNCTION public.rate_limit_check_ip(text,text,int,int) TO service_role;
