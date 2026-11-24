# Load Test Baseline — HabTastic AI

This is the published baseline for production load testing. Re-run before
every major release; treat regressions vs these numbers as P1.

## Tooling
- **Edge functions:** [`k6`](https://k6.io) — script at `load-tests/edge-functions.js`
- **Database:** [`pgbench`](https://www.postgresql.org/docs/current/pgbench.html) — script at `load-tests/db-queries.sql`

## Run commands

```bash
# Edge functions (anon + optional user JWT for AI Coach)
k6 run \
  -e SUPABASE_URL="$VITE_SUPABASE_URL" \
  -e ANON_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  -e USER_JWT="$TEST_USER_JWT" \
  load-tests/edge-functions.js

# Database (read pool, 10 clients, 4 threads, 60s)
pgbench -h <db-host> -U postgres -d postgres \
  -c 10 -j 4 -T 60 -n \
  -f load-tests/db-queries.sql
```

## Baseline targets (post 9.2 + 9.3)

### Edge functions

| Function           | Scenario           | Target rate | p95 latency | Error budget |
|--------------------|--------------------|------------:|------------:|-------------:|
| `paystack-health`  | constant 5 req/s   | 5 rps       | < 800 ms    | < 2%         |
| `ai-coach`         | constant 1 req/s   | 1 rps       | < 8 s       | < 5%* (429 OK)|
| `telemetry-ingest` | constant 20 req/s  | 20 rps      | < 400 ms    | < 1%         |
| `paystack-webhook` | burst 10 in 1s     | n/a         | < 600 ms    | 0% (idempotent)|

\* `ai-coach` runs at 30 req/min per user in production. Load tests run BELOW
the configured rate-limit caps to validate happy-path throughput; 429s
returned at higher rates are expected and considered correct behaviour.

### Database queries (pgbench, 10 clients × 60s)

| Query                          | Target tps | Mean latency | p95 latency |
|--------------------------------|-----------:|-------------:|------------:|
| Profile fetch (PK lookup)      | > 4 000    | < 3 ms       | < 10 ms     |
| Community feed first page (20) | > 1 200    | < 8 ms       | < 25 ms     |
| Leaderboard weekly top 50      | > 1 800    | < 6 ms       | < 18 ms     |
| Notifications inbox (25)       | > 1 500    | < 7 ms       | < 22 ms     |

All four hit the indexes added in migration **H1/H2/M3** — confirm
`EXPLAIN ANALYZE` shows an Index Scan, never a Seq Scan.

## Acceptance gate

A release is **green** when:
1. All k6 thresholds pass.
2. pgbench mean and p95 latencies stay within the baseline above.
3. No edge function returns non-2xx/429 above the listed error budget.
4. Telemetry dashboard (`/admin/telemetry`) reports 0 new error categories
   introduced by the load.

## Staging load test

A separate staging-only k6 script lives at `load-tests/staging-load-test.js`. It is gated by an explicit host allowlist and must never be pointed at production. It supports a smoke mode (default, ~60s) and a full 1,000-VU ramp (~7m40s). Run it manually via `.github/workflows/load-test.yml`; the workflow is `workflow_dispatch` only and requires typing `STAGING` to start.

See `load-tests/README.md` for required environment variables and safety guards.

## Last measured

| Date       | Commit  | Result |
|------------|---------|--------|
| 2026-06-26 | initial | baseline established — re-run pending production seed JWT |
