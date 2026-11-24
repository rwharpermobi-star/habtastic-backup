-- Prevent one provider-side failure from globally blocking every user's avatar generation.
-- The previous function returned the most recent blocked request regardless of owner.
CREATE OR REPLACE FUNCTION public.begin_avatar_generation(_user_id uuid, _request_id uuid, _preferences jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.profiles; r public.avatar_generation_requests; lim int; used int; reset_at timestamptz; previous jsonb; chosen text; males int; females int;
BEGIN
 IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _user_id IS NULL OR _request_id IS NULL OR jsonb_typeof(_preferences) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_request'; END IF;
 SELECT * INTO p FROM public.profiles WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_missing'; END IF;
 SELECT * INTO r FROM public.avatar_generation_requests WHERE user_id=_user_id AND request_id=_request_id;
 IF FOUND THEN
  IF r.preferences <> _preferences THEN RETURN jsonb_build_object('code','REQUEST_REUSED','error','Request preferences changed. Start a new generation.'); END IF;
  IF r.status='succeeded' THEN RETURN r.result || jsonb_build_object('replayed',true); END IF;
  RETURN coalesce(r.result,'{}'::jsonb) || jsonb_build_object('code',CASE WHEN r.status='pending' THEN 'IN_PROGRESS' ELSE 'REQUEST_FINISHED' END,'error',coalesce(r.result->>'error','This request is already being processed.'));
 END IF;
 UPDATE public.avatar_generation_requests SET status='abandoned', updated_at=now(), result=jsonb_build_object('error','Generation was interrupted. No avatar credit was charged.') WHERE user_id=_user_id AND status='pending' AND created_at < now()-interval '15 minutes';
 IF EXISTS(SELECT 1 FROM public.avatar_generation_requests WHERE user_id=_user_id AND status='pending') THEN RETURN jsonb_build_object('code','IN_PROGRESS','error','An avatar is already being generated. Please wait.'); END IF;
 lim := CASE WHEN (p.is_premium AND (p.premium_until IS NULL OR p.premium_until>now())) OR (p.trial_started_at<=now() AND p.trial_started_at>now()-interval '5 days') THEN 30 ELSE 3 END;
 reset_at := p.ai_avatar_credits_reset_at;
 used := p.ai_avatar_credits_used;
 IF reset_at IS NULL OR reset_at<=now()-interval '24 hours' THEN used:=0; reset_at:=now(); END IF;
 IF used>=lim THEN RETURN jsonb_build_object('code','DAILY_LIMIT_REACHED','error','You have used all your avatar credits today.','creditsUsed',used,'creditsLimit',lim,'resetAt',reset_at); END IF;
 SELECT specification INTO previous FROM public.avatar_generation_requests WHERE user_id=_user_id AND status='succeeded' ORDER BY created_at DESC LIMIT 1;
 chosen:=_preferences->>'gender';
 IF chosen='Surprise me' THEN
  PERFORM pg_advisory_xact_lock(hashtext('avatar-default-gender-balance'));
  SELECT count(*) FILTER(WHERE specification->>'gender'='Male'),count(*) FILTER(WHERE specification->>'gender'='Female') INTO males,females FROM public.avatar_generation_requests WHERE preferences->>'gender'='Surprise me' AND status IN ('succeeded','pending');
  chosen:=CASE WHEN males<females THEN 'Male' WHEN females<males THEN 'Female' ELSE CASE WHEN random()<0.5 THEN 'Male' ELSE 'Female' END END;
 END IF;
 INSERT INTO public.avatar_generation_requests(user_id,request_id,preferences,specification) VALUES(_user_id,_request_id,_preferences,jsonb_build_object('gender',chosen));
 RETURN jsonb_build_object('allowed',true,'gender',chosen,'previousSpecification',previous,'creditsUsed',used,'creditsLimit',lim,'resetAt',reset_at);
END $$;