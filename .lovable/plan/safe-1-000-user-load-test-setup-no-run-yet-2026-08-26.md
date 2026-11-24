# Safe 1,000-User Load Test Setup (no run yet)

Goal: a staging-only k6 load test that physically cannot hit production, with a smoke mode and a manual-only GitHub workflow. Nothing is executed in this task beyond syntax validation.

## Files

**New**
- `load-tests/staging-load-test.js` — the main k6 script (guards, ramp, thresholds, safe flows).
- `load-tests/README.md` — how to run smoke vs full locally, required env vars, what is deliberately not tested.
- `.github/workflows/load-test.yml` — manual-only workflow.

**Changed**
- `docs/load-test-baseline.md` — add a section for the new staging test and where its summary artifact lands.

**Untouched**
- `load-tests/k6-load-test.js`, `edge-functions.js`, `db-queries.sql` stay as-is (legacy references). No app or Edge Function code changes.

## Environment variables (required, script aborts if any missing)

`LOAD_TEST_BASE_URL`, `LOAD_TEST_SUPABASE_URL`, `LOAD_TEST_ANON_KEY`, `LOAD_TEST_USER_EMAIL`, `LOAD_TEST_USER_PASSWORD`, `LOAD_TEST_ALLOWED_WEB_HOST`, `LOAD_TEST_ALLOWED_SUPABASE_HOST`

No long-lived JWT is stored anywhere — `LOAD_TEST_USER_JWT` is dropped entirely.

Optional: `LOAD_TEST_HABIT_ID` (dedicated test habit for completion writes — when absent, the completion flow is skipped instead of writing to unknown data), `TEST_SIZE` (`smoke` | `full`, default `smoke`).

## Authentication (in k6 `setup()`, before any load stage)

1. `POST ${LOAD_TEST_SUPABASE_URL}/auth/v1/token?grant_type=password` with headers `apikey: LOAD_TEST_ANON_KEY`, `Content-Type: application/json` and body `{ email, password }` from the env vars.
2. On non-200 or a missing `access_token`: `throw` with only the HTTP status and the provider's `error`/`error_description` string — never the password, never the token, never the response body verbatim if it could echo credentials. The test aborts in `setup()`, so zero load-stage traffic is sent.
3. On success the token is returned from `setup()` and used as `Authorization: Bearer <token>` by every VU. Only a masked fingerprint (`length` + last 4 chars) is ever logged.
4. `service_role` is never used or referenced.

## Safety guards

1. Missing any required var -> `throw` before any request is made (k6 exits non-zero, zero traffic sent).
2. **Staging allowlist (primary):** `hostname(LOAD_TEST_BASE_URL)` must exactly equal `LOAD_TEST_ALLOWED_WEB_HOST` and `hostname(LOAD_TEST_SUPABASE_URL)` must exactly equal `LOAD_TEST_ALLOWED_SUPABASE_HOST` — case-normalised exact string match, no suffix or wildcard matching. Any mismatch throws immediately, before login and before any request.
3. **Production denylist (defense-in-depth):** even on an allowlist match, hostnames matching known production hosts abort the run. Blocked hosts are: `habtastic.com`, `www.habtastic.com`, `habtastic.lovable.app`, and the production Supabase host `votldorvfuktonwewuhm.supabase.co`. Other `*.lovable.app` hosts are allowed in case the staging environment uses a Lovable preview URL.
4. Both URLs must be absolute `http(s)`; hostname is parsed from the URL, so paths, ports, and trailing slashes cannot smuggle a production host past the check.
5. Default `TEST_SIZE` is `smoke`, so an argument-less run can never become a 1,000-VU run.
6. No Paystack, purchase, AI/Winston, email, push, or admin endpoint is referenced anywhere in the script.
7. Habit completion only ever touches the single explicitly supplied `LOAD_TEST_HABIT_ID`.

All guards run at module init / top of `setup()`, so a failed check means **zero requests sent**.

## Flows exercised (read-mostly)

- `GET /auth/v1/user` — session validity.
- `GET /rest/v1/profiles?select=...&limit=1` — dashboard/profile read.
- `GET /rest/v1/habits?select=...` — habits list.
- `GET /rest/v1/weekly_scores?order=score.desc&limit=50` — leaderboard read.
- `GET /rest/v1/notifications?...&limit=25` — inbox read.
- `POST /functions/v1/telemetry-ingest` — safe, rate-limited, non-billing edge function.
- `GET LOAD_TEST_BASE_URL/` — static app shell.
- Habit completion (only with `LOAD_TEST_HABIT_ID`): a PATCH toggling the completion for a fixed test date, at low weight (~1 iteration in 5), so it is realistic without hammering writes.
- 1-4s randomised think time between iterations.

## VU ramp

Full (`test_size=full`, ~7m40s total):

```text
stage  duration  target VUs
1      30s          10
2      45s          50
3      60s         200
4      90s         500
5      90s        1000
6      60s        1000   (hold)
7      45s         200
8      30s           0
```

Smoke (`test_size=smoke`, ~60s total):

```text
stage  duration  target VUs
1      15s          20
2      35s          20   (hold)
3      10s           0
```

## Thresholds and metrics

- `http_req_failed: rate<0.01` — 429s are excluded from this rate so intentional rate limiting is never scored as a crash.
- `http_req_duration{expected_response:true}: p(95)<2000`
- Summary trend percentiles configured to print `p(50) p(90) p(95) p(99)` plus avg/max.
- Custom `Rate` metrics: `rate_limited_429` — threshold `rate<0.10`, **failing** (more than 10% rate limiting counts as degraded capacity, not a crash) — and `server_errors_5xx` (threshold `rate<0.01`, hard fail). 429s are reported separately from failures throughout.
- `handleSummary` prints and writes `load-tests/last-summary.json` + `load-tests/summary.txt` with: requests/sec (`http_reqs` rate), completed iterations, peak VUs (`vus_max`), p50/p90/p95/p99, 429 rate, 5xx rate, per-flow latency trends.

## GitHub Actions workflow

`.github/workflows/load-test.yml`:
- `on: workflow_dispatch:` only — no `push`, no `pull_request`, no `schedule`.
- Inputs: `test_size` (choice: `smoke` default, `full`), plus a required `confirm_staging` text input that must equal exactly `STAGING` or the job fails fast before k6 is invoked.
- `timeout-minutes: 20`; k6 installed via the official apt/binary download.
- Env pulled from repository secrets only (no inline URLs, no fallbacks).
- `actions/upload-artifact` with `retention-days: 5`, uploading `load-tests/summary.txt` and `load-tests/last-summary.json`, `if: always()`.
- `concurrency` group so two load tests can't run at once.

## Final required GitHub Secrets

- `LOAD_TEST_BASE_URL` — staging web URL
- `LOAD_TEST_SUPABASE_URL` — staging Supabase URL
- `LOAD_TEST_ANON_KEY` — staging anon/publishable key
- `LOAD_TEST_USER_EMAIL` — staging test user email
- `LOAD_TEST_USER_PASSWORD` — staging test user password
- `LOAD_TEST_ALLOWED_WEB_HOST` — exact expected staging web hostname
- `LOAD_TEST_ALLOWED_SUPABASE_HOST` — exact expected staging Supabase hostname

Optional: `LOAD_TEST_HABIT_ID` — staging test habit UUID for the completion flow.

## Validation performed at the end

- `node --check` on the k6 script (ES module parse) and a syntax-only import check.
- YAML parse of `load-test.yml` with `js-yaml`, asserting the `on:` keys are exactly `workflow_dispatch`.
- A guard-behaviour dry check of the pure guard helpers (missing vars, host mismatch, production host) proving each throws before any request would be issued.
- Syntax validation only — k6 is never executed, no smoke run, no full run, zero load traffic.
