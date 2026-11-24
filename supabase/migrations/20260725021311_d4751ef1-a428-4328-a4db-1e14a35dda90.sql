
REVOKE SELECT (signup_ip, device_fingerprint, admin_status, admin_notes, admin_reviewed_by, admin_reviewed_at)
  ON public.referrals FROM authenticated;
REVOKE SELECT (signup_ip, device_fingerprint, admin_status, admin_notes, admin_reviewed_by, admin_reviewed_at)
  ON public.referrals FROM anon;

ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
