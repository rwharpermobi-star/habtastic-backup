# HabTastic email queue runbook

## Why this exists

HabTastic's email queue was provisioned and active before the July 2026
database rebuild. The rebuild removed PGMQ, the queue tables, the wrapper RPCs,
and the cron schedule, while the Edge Functions and user-facing email features
remained deployed. The restoration migration is:

`supabase/migrations/20260831043000_restore_email_queue_backend.sql`

The migration creates the backend but intentionally does **not** start the
worker. Scheduling is a separate, explicit production step.

## Approval boundary

Applying the migration, provisioning Vault, deploying the functions, or
installing the schedules changes production. Perform those steps only after an
explicit rollout approval; review/readiness queries may be run read-only.

## Production deployment order

1. Confirm a recent database backup/PITR checkpoint and review the migration.
2. Apply `20260831043000_restore_email_queue_backend.sql`.
3. In Supabase Database Vault, create these exact secret names:
   - `habtastic_project_url`: the project URL, without a trailing slash.
   - `habtastic_email_worker_service_role`: the production service-role key.
4. Deploy `send-transactional-email` and `process-email-queue` from the same
   reviewed commit and confirm both gateway configurations are
   `verify_jwt = true`. The transactional sender also enforces its own
   authenticated-user/service-role checks and keeps receipt/lifecycle/alert
   templates backend-only.
5. Deploy `auth-email-hook` from the same commit so auth-hook retries carry the
   provider idempotency key and all Auth templates use the canonical HabTastic
   domain and logo asset.
6. Start the worker and retention schedules from a privileged SQL session:

   ```sql
   select private.install_email_queue_schedules();
   ```

7. Run the readiness checks below, then send one transactional test message to
   a controlled HabTastic test inbox. Confirm an unauthenticated sender is 401,
   a signed-in user cannot request `payment-receipt`, and a forged/wrong worker
   bearer is 401.
8. Deploy the web welcome-flow change and the Paystack webhook/retry receipt
   producer only after the queue smoke test is green. Both producers use stable
   idempotency keys.
9. Only after those smoke tests pass, decide whether to activate the
   Supabase Auth Send Email Hook. Activating it replaces built-in Auth email
   delivery, so signup and recovery must be tested immediately afterward.

Never place the service-role key in this repository, a `VITE_` variable, an
Android resource, a GitHub Actions log, or a support ticket. The value in Vault
must match the server-only `SUPABASE_SERVICE_ROLE_KEY` available to Edge
Functions.

## Readiness checks

These checks expose names and counts only; they do not reveal Vault values or
queued message bodies.

```sql
select extname
from pg_extension
where extname in ('pgmq', 'pg_cron', 'pg_net', 'supabase_vault')
order by extname;

select to_regclass(name) as relation
from (values
  ('public.email_send_log'),
  ('public.email_send_state'),
  ('public.suppressed_emails'),
  ('public.email_unsubscribe_tokens'),
  ('public.email_enqueue_claims'),
  ('pgmq.q_auth_emails'),
  ('pgmq.q_transactional_emails'),
  ('pgmq.q_auth_emails_dlq'),
  ('pgmq.q_transactional_emails_dlq')
) as expected(name);

select name
from vault.secrets
where name in (
  'habtastic_project_url',
  'habtastic_email_worker_service_role'
)
order by name;

select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'habtastic-process-email-queue',
  'habtastic-prune-email-operational-data'
)
order by jobname;

select status, count(*)
from public.email_send_log
where created_at >= now() - interval '1 hour'
group by status
order by status;
```

Expected behavior after a successful transactional smoke test:

- The enqueue function returns `success: true, queued: true`.
- A `pending` log row is followed by one `sent` row for the same message ID.
- The source queue returns to zero visible messages.
- No `failed`, `rate_limited`, or `dlq` row is added.
- The `process-email-queue` Edge log shows HTTP 200.

## Product behavior intentionally still disabled

- Automatic habit-reminder emails do not have a backend scheduler or durable
  preference model. The app now labels the feature **Coming soon**, keeps its
  switch disabled, and offers only a signed-in-account delivery test.
- The `trial-ended` template has no authoritative lifecycle producer yet. Do
  not schedule it until trial expiry has one idempotent source of truth.

## Safe stop / rollback

If errors appear, stop new processing without deleting queue data:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname in (
  'habtastic-process-email-queue',
  'habtastic-prune-email-operational-data'
);
```

If the Auth Send Email Hook was activated, disable it in Supabase Auth first so
Supabase resumes its built-in Auth email path. Do not drop queue tables or purge
messages during incident response; inspect the DLQ and logs, fix the cause, and
then reinstall the schedules.

## Monitoring thresholds

- Any `dlq` entry: investigate immediately.
- Any `forbidden` stop in the worker: verify sender-domain status and the
  `LOVABLE_API_KEY`/provider configuration.
- More than five `failed` rows for one message ID: the retry budget is exhausted
  and the message should move to its DLQ.
- Oldest visible auth message over five minutes: worker or provider degradation.
- HTTP 401 from the worker: cron's Vault service-role value does not match the
  current project key, or the gateway is pointed at another project.
