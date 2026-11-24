# HabTastic

> **Build better habits. Make progress feel like a game.**

HabTastic is a playful, gamified habit-tracking app designed to make consistency more engaging. It combines habit tracking, progress, rewards, motivation, and AI-assisted coaching into one experience.

**Project:** HabTastic  
**Stack:** React 18 · Vite · TypeScript · Tailwind CSS · Supabase/Lovable Cloud

## ❤️ Support HabTastic

HabTastic is being built as a long-term product, and sponsorship helps fund continued development, infrastructure, testing, security hardening, and new features.

### Why sponsor?

Your support helps us:

- Build and ship new habit-tracking features
- Improve AI-assisted coaching and personalization
- Maintain reliable backend infrastructure
- Improve Android/mobile support
- Strengthen security and automated testing
- Keep development moving toward a polished production product

### Sponsor HabTastic

If you like the project and want to help it grow, you can support the development through **GitHub Sponsors**:

**👉 [Sponsor @rwharpermobi-star](https://github.com/sponsors/rwharpermobi-star)**

Every contribution helps. Sponsors are supporting the continued development of an independent product and its open-source development work.

## 🚀 What we're building

HabTastic is designed around a simple idea: **turn consistency into something people actually enjoy coming back to.**

Core product areas include:

- 🎯 Habit tracking and daily progress
- 🤖 AI-assisted coaching
- ⭐ XP, streaks, and progression
- 🪙 Rewards and an in-app coin economy
- 🧑‍🎨 Avatar customization and cosmetics
- 🏆 Competitive and social elements
- 📱 Mobile/Android support
- 🔔 Notifications and reminders
- 📊 Progress and performance visualization

## 🛠️ Technology

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Supabase / Lovable Cloud
- Capacitor for Android
- Vitest
- Playwright
- GitHub Actions

## 🗺️ Development direction

The project is being developed in stages, with the focus on building a stable core product before expanding the economy, social features, AI capabilities, and monetization.

Current development priorities include:

1. Production stability and reliability
2. Security and backend integrity
3. Payments and subscriptions
4. Notifications and mobile functionality
5. AI coaching
6. Rewards, referrals, avatars, and cosmetics
7. Community and growth features

## 🔐 Production Security Verification

The workflow `.github/workflows/post-deploy-verify.yml` guards production against RLS / RPC regressions after every deploy. It runs on:

- `deployment_status` (only when `state == 'success'`)
- `workflow_dispatch` (manual)
- Nightly cron at `03:00 UTC`

### What it does

1. **Anon vitest sweep** — runs `src/test/security.test.ts` against the live deployed database using the public anon key. Confirms RLS blocks unauthenticated writes to economy ledgers, referrals, weekly scores, etc.
2. **Reachability smoke test** — unauthenticated `POST` to the explicit `security-verify?health=1` health contract. Expects HTTP `200` and retries transient failures up to 5 times with exponential backoff.
3. **Admin-gated contract sweep** — signs in with the configured admin verification account to mint a fresh short-lived JWT, then calls `security-verify`. The function re-asserts the full economy contract (anon-denied RPCs, blocked ledger writes, service-role baseline). Non-200 fails the deploy. Transient failures are retried; hard 4xx contract failures are not.

Each attempt prints the request URL, HTTP status, and redacted response body. JWTs are masked via `::add-mask::` and any accidental JWT-shaped token in output is rewritten to `[REDACTED_JWT]`. The final JSON report is retained as the `security-verify-<run-id>` artifact for 5 days.

### Environment variables

Public values (Supabase project URL, anon key) are inlined in the workflow — they already ship in the browser bundle, so there is nothing to configure for the smoke test to run.

| Name | Required? | Where it lives | Purpose |
|---|---|---|---|
| `VERIFY_ADMIN_EMAIL` | Recommended | GitHub repo secret | Dedicated verification user with `admin` in `public.user_roles`. |
| `VERIFY_ADMIN_PASSWORD` | Recommended | GitHub repo secret | Password used only to mint a fresh short-lived token during the job. |
| `VERIFY_ADMIN_JWT` | Legacy | GitHub repo secret | Temporary fallback; expires and should not be used for scheduled checks. |

When no admin credentials are configured, the admin sweep warns and skips. The anon RLS suite and reachability check still gate the job.

### Configuring the admin verification account

1. Use a dedicated, least-privilege test account with an `admin` row in `public.user_roles`.
2. Save its email as `VERIFY_ADMIN_EMAIL` and password as `VERIFY_ADMIN_PASSWORD` in GitHub Actions secrets.
3. Do not store a copied access token; the workflow obtains and masks a fresh one for every run.

### Diagnosing failures

- **Smoke test fails with status 000** — network issue or DNS. Re-run; if persistent, the Edge Function was not deployed. Redeploy from the Lovable editor.
- **Smoke test fails with 404** — the `security-verify` function is missing from the project. Redeploy edge functions.
- **Token mint fails** — verify `VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD` and the account's confirmed status.
- **Admin sweep fails with 401/403** — the verification account may have lost its `admin` role.
- **Admin sweep fails with 500** — the function returned a failing check. Download the `security-verify-<run-id>` artifact to see which named assertion failed.

---

## 🤝 Contributing

Issues, feedback, ideas, and code contributions are welcome. If you find a bug or have an improvement in mind, open an issue with enough detail to reproduce or evaluate the proposal.

## 📄 License

See the repository for licensing information.

---

**Built with the goal of making better habits easier to build — and more rewarding to stick with.**
