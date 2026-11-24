REVOKE EXECUTE ON FUNCTION public.rate_limit_check(text, integer, integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_check_user(_user_id uuid, _action text, _window_seconds integer, _max integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _bucket timestamptz;
  _count integer;
begin
  if _user_id is null then
    raise exception 'unauthorized';
  end if;
  if coalesce(_action, '') = '' or _window_seconds <= 0 or _max <= 0 then
    raise exception 'invalid_rate_limit';
  end if;

  _bucket := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);

  insert into public.rate_limits_user(user_id, action, window_seconds, window_start, request_count)
  values (_user_id, _action, _window_seconds, _bucket, 1)
  on conflict (user_id, action, window_seconds, window_start)
  do update set request_count = public.rate_limits_user.request_count + 1
  returning request_count into _count;

  delete from public.rate_limits_user where window_start < now() - interval '2 days';

  if _count > _max then
    raise exception 'rate_limited';
  end if;
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION public.rate_limit_check_user(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_check_user(uuid, text, integer, integer) TO service_role;