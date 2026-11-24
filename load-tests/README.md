# HabTastic AI — Staging Load Test

This directory contains the **staging-only** k6 load test for HabTastic AI. It is deliberately engineered so it cannot accidentally target production.

## Quick start

### Smoke test (default, ~60s, 20 VUs)

```bash
k6 run \
  -e LOAD_TEST_BASE_URL="https://your-staging-app.example" \
  -e LOAD_TEST_SUPABASE_URL="https://your-staging-ref.supabase.co" \
  -e LOAD_TEST_ANON_KEY="your-staging-anon-key" \
  -e LOAD_TEST_USER_EMAIL="loadtest@example.com" \
  -e LOAD_TEST_USER_PASSWORD="your-staging-password" \
  -e LOAD_TEST_ALLOWED_WEB_HOST="your-staging-app.example" \
  -e LOAD_TEST_ALLOWED_SUPABASE_HOST="your-staging-ref.supabase.co" \
  -e LOAD_TEST_HABIT_ID="optional-test-habit-uuid" \
  load-tests/staging-load-test.js
```

### Full 1,000-user ramp (~7m40s)

Add `-e TEST_SIZE=full` to the command above.

## What this tests

- Static app shell load (`GET BASE_URL/`)
- Authenticated session check (`GET /auth/v1/user`)
- Profile read (`GET /rest/v1/profiles`)
- Habits list (`GET /rest/v1/habits`)
- Leaderboard read (`GET /rest/v1/weekly_scores`)
- Notifications inbox (`GET /rest/v1/notifications`)
- Telemetry ingest (`POST /functions/v1/telemetry-ingest`)
- Optional habit completion (`POST /functions/v1/complete-habit`) when `LOAD_TEST_HABIT_ID` is set

## What this deliberately does NOT test

- Real Paystack transactions
- Premium purchases
- Real email sends
- Real push notifications
- Winston / AI / voice requests that consume paid credits
- Destructive admin actions

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `LOAD_TEST_BASE_URL` | Staging web URL |
| `LOAD_TEST_SUPABASE_URL` | Staging Supabase URL |
| `LOAD_TEST_ANON_KEY` | Staging anon/publishable key |
| `LOAD_TEST_USER_EMAIL` | Staging test user email |
| `LOAD_TEST_USER_PASSWORD` | Staging test user password |
| `LOAD_TEST_ALLOWED_WEB_HOST` | Exact expected hostname of `LOAD_TEST_BASE_URL` |
| `LOAD_TEST_ALLOWED_SUPABASE_HOST` | Exact expected hostname of `LOAD_TEST_SUPABASE_URL` |

## Optional environment variables

| Variable | Purpose |
|----------|---------|
| `LOAD_TEST_HABIT_ID` | UUID of a dedicated test habit for low-weight completion writes |
| `TEST_SIZE` | `smoke` (default) or `full` |

## Safety guards

1. The script refuses to start if any required variable is missing.
2. The parsed hostname of `LOAD_TEST_BASE_URL` must **exactly** equal `LOAD_TEST_ALLOWED_WEB_HOST`.
3. The parsed hostname of `LOAD_TEST_SUPABASE_URL` must **exactly** equal `LOAD_TEST_ALLOWED_SUPABASE_HOST`.
4. Known production hosts (`habtastic.com`, `www.habtastic.com`, `habtastic.lovable.app`, `votldorvfuktonwewuhm.supabase.co`) are blocked as defense-in-depth.
5. `TEST_SIZE` defaults to `smoke`, so an unconfigured run cannot become a 1,000-VU test.
6. Login happens in k6 `setup()`; if login fails, the test aborts before any load-stage traffic is sent.
7. Passwords and full access tokens are never printed.

## CI

The GitHub Actions workflow `.github/workflows/load-test.yml` is `workflow_dispatch` only — it cannot be triggered by push, pull request, or schedule. Run it manually from the Actions tab.

## Outputs

- `load-tests/last-summary.json` — full k6 summary
- `load-tests/summary.txt` — human-readable summary

Both are uploaded as artifacts by the CI workflow with a 5-day retention.
