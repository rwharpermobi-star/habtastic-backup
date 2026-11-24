import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const migrationPath =
  'supabase/migrations/20260831043000_restore_email_queue_backend.sql';

const [
  config,
  worker,
  authHook,
  transactionalSender,
  authContext,
  paystackProcessor,
  migration,
] = await Promise.all([
  readFile('supabase/config.toml', 'utf8'),
  readFile('supabase/functions/process-email-queue/index.ts', 'utf8'),
  readFile('supabase/functions/auth-email-hook/index.ts', 'utf8'),
  readFile('supabase/functions/send-transactional-email/index.ts', 'utf8'),
  readFile('src/contexts/AuthContext.tsx', 'utf8'),
  readFile('supabase/functions/_shared/paystack-processor.ts', 'utf8'),
  readFile(migrationPath, 'utf8'),
]);

const templateDirectories = [
  'supabase/functions/_shared/email-templates',
  'supabase/functions/_shared/transactional-email-templates',
];
const templatePaths = (
  await Promise.all(
    templateDirectories.map(async (directory) =>
      (await readdir(directory))
        .filter((name) => name.endsWith('.tsx'))
        .map((name) => join(directory, name)),
    ),
  )
).flat();
const emailTemplateSource = (
  await Promise.all(templatePaths.map((path) => readFile(path, 'utf8')))
).join('\n');

assert.match(
  config,
  /\[functions\.process-email-queue\]\s+verify_jwt\s*=\s*true/,
  'process-email-queue must keep gateway JWT verification enabled',
);
assert.match(
  config,
  /\[functions\.send-transactional-email\]\s+verify_jwt\s*=\s*true/,
  'send-transactional-email must keep gateway JWT verification enabled',
);

assert.match(
  worker,
  /hasServiceRoleBearer\(req,\s*supabaseServiceKey\)/,
  'the queue worker must compare the bearer with the server-held service key',
);
assert.doesNotMatch(
  worker,
  /decodeJwt|atob\([^)]*split\(['"]\.['"]\)/,
  'the queue worker must not trust decoded JWT claims',
);
assert.match(
  worker,
  /visibility_timeout_seconds/,
  'the worker must use the durable visibility-timeout configuration',
);
assert.match(
  authHook,
  /idempotency_key:\s*run_id/,
  'auth-hook retries must reuse the provider idempotency key',
);
assert.match(
  transactionalSender,
  /USER_CALLABLE_TEMPLATES[\s\S]*?'welcome'[\s\S]*?'habit-reminder-test'[\s\S]*?'support-notification'/,
  'end users must be restricted to the interactive transactional templates',
);
for (const backendTemplate of ['payment-receipt', 'trial-ended', 'paystack-webhook-alert']) {
  assert.doesNotMatch(
    transactionalSender.match(/USER_CALLABLE_TEMPLATES[\s\S]*?\]\)/)?.[0] ?? '',
    new RegExp(`['"]${backendTemplate}['"]`),
    `${backendTemplate} must remain backend-only`,
  );
}
assert.match(
  authContext,
  /_event === 'SIGNED_IN'[\s\S]*?idempotencyKey:\s*`welcome-\$\{session\.user\.id\}`/,
  'welcome email must be queued after a new account becomes authenticated',
);
assert.match(
  paystackProcessor,
  /idempotencyKey:\s*`payment-receipt-\$\{dedupeReference\}`/,
  'payment events must enqueue an idempotent receipt',
);
assert.doesNotMatch(
  `${authHook}\n${transactionalSender}\n${emailTemplateSource}`,
  /app\.habtastic\.com|tunzvhipdfudcnzjxvbd/,
  'email templates must not use the retired app subdomain or old Supabase project',
);

for (const extension of ['pgmq', 'pg_cron', 'pg_net']) {
  assert.match(
    migration,
    new RegExp(`CREATE EXTENSION IF NOT EXISTS ${extension}`),
    `${migrationPath} must provision ${extension}`,
  );
}

for (const relation of [
  'email_send_log',
  'email_send_state',
  'suppressed_emails',
  'email_unsubscribe_tokens',
  'email_enqueue_claims',
]) {
  assert.match(
    migration,
    new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${relation}`),
    `${migrationPath} must provision public.${relation}`,
  );
}

for (const fn of [
  'enqueue_email',
  'read_email_batch',
  'delete_email',
  'move_to_dlq',
]) {
  assert.match(
    migration,
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`),
    `${migrationPath} must provision public.${fn}`,
  );
  assert.match(
    migration,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?TO service_role;`),
    `public.${fn} must be service-role only`,
  );
}

assert.match(
  migration,
  /habtastic_email_worker_service_role/,
  'the scheduler must resolve its backend bearer from Vault',
);
assert.doesNotMatch(
  migration,
  /VITE_|sb_secret_|eyJ[a-zA-Z0-9_-]{20,}/,
  'the migration must not contain a client-prefixed or literal credential',
);

process.stdout.write('Email queue configuration checks passed.\n');
