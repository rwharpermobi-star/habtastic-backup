CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pgmq'
AS $function$
#variable_conflict use_column
DECLARE
  dedupe_key text;
  owns_claim boolean := false;
  queued_message_id bigint;
BEGIN
  IF enqueue_email.queue_name NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Unsupported email queue' USING ERRCODE = '22023';
  END IF;
  IF enqueue_email.payload IS NULL OR jsonb_typeof(enqueue_email.payload) <> 'object' THEN
    RAISE EXCEPTION 'Email payload must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF coalesce(enqueue_email.payload->>'message_id', '') = ''
     OR coalesce(enqueue_email.payload->>'to', '') = ''
     OR coalesce(enqueue_email.payload->>'subject', '') = '' THEN
    RAISE EXCEPTION 'Email payload is missing required fields' USING ERRCODE = '22023';
  END IF;

  dedupe_key := coalesce(
    nullif(btrim(enqueue_email.payload->>'idempotency_key'), ''),
    nullif(btrim(enqueue_email.payload->>'run_id'), '')
  );

  IF dedupe_key IS NOT NULL THEN
    IF char_length(dedupe_key) > 500 THEN
      RAISE EXCEPTION 'Email idempotency key is too long' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.email_enqueue_claims AS c (queue_name, idempotency_key, message_id)
    VALUES (enqueue_email.queue_name, dedupe_key, enqueue_email.payload->>'message_id')
    ON CONFLICT (queue_name, idempotency_key) DO NOTHING
    RETURNING true INTO owns_claim;

    IF NOT coalesce(owns_claim, false) THEN
      SELECT claim.queue_message_id
      INTO queued_message_id
      FROM public.email_enqueue_claims AS claim
      WHERE claim.queue_name = enqueue_email.queue_name
        AND claim.idempotency_key = dedupe_key;

      IF queued_message_id IS NULL THEN
        RAISE EXCEPTION 'Existing email enqueue claim is incomplete';
      END IF;
      RETURN queued_message_id;
    END IF;
  END IF;

  SELECT pgmq.send(enqueue_email.queue_name, enqueue_email.payload)
  INTO queued_message_id;

  IF dedupe_key IS NOT NULL THEN
    UPDATE public.email_enqueue_claims AS claim
    SET queue_message_id = queued_message_id
    WHERE claim.queue_name = enqueue_email.queue_name
      AND claim.idempotency_key = dedupe_key;
  END IF;

  RETURN queued_message_id;
END
$function$;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;