# HabTastic AI — Code Quality Audit

_Audit run: 2026-06-27_

## Codebase Snapshot

| Area              | Count        |
| ----------------- | ------------ |
| Pages             | 55 → **54**  |
| Components        | 85 → **73**  |
| Hooks             | 60 → **55**  |
| Edge Functions    | 32           |
| Total TS/TSX LOC  | ~32,700      |
| `any` occurrences | 191 (74 files) |

## Findings

### 1. Dead code (eliminated this pass)

Confirmed zero references in the source graph before deletion:

**Components (12)**
- `AdSlot.tsx`, `DailyMissionsCard.tsx`, `GoalsPanel.tsx`, `NavLink.tsx`,
  `PremiumSheet.tsx`, `RetentionBanner.tsx`, `SmartNotificationSettings.tsx`,
  `StreakBadge.tsx`, `TrialEndedModal.tsx`, `TrialEndingBanner.tsx`,
  `WeeklySummaryCard.tsx`, `WinstonCelebrationModal.tsx`

**Hooks (5)**
- `useDailyMissions.ts`, `usePricingCtaVariant.ts`, `useTrialEndedEmail.ts`,
  `useWeeklySummary.ts`, `useWinstonCelebrations.ts`

**Pages / assets (2)**
- `pages/Index.tsx` (no route binding), `src/App.css` (not imported)

### 2. Largest files (refactor candidates, deferred)

| File                                 | LOC  |
| ------------------------------------ | ---- |
| `pages/Coach.tsx`                    | 1080 |
| `pages/Journal.tsx`                  |  833 |
| `pages/NotificationsSettings.tsx`    |  831 |
| `pages/Onboarding.tsx`               |  805 |
| `pages/Referral.tsx`                 |  724 |
| `pages/Dashboard.tsx`                |  680 |
| `pages/Pricing.tsx`                  |  593 |
| `components/InviteEarnCard.tsx`      |  548 |
| `components/WellnessSessionPlayer`   |  523 |


These work today; splitting them carries regression risk and is scheduled for a focused follow-up per feature (one PR each).

### 3. Type safety

- 191 `any` occurrences across 74 files — heaviest in older Winston voice
  hooks and Paystack callbacks.
- Recommendation: tighten in vertical slices alongside the file-split refactors
  above; do not mass-replace `any` with `unknown` in one pass.

### 4. Edge functions

- 22 of 32 edge functions duplicate the same `corsHeaders` object literal.
- Shared `_shared/rate-limit.ts` is in use; consolidating CORS/JSON response
  helpers into `_shared/http.ts` is a candidate for the next pass.

### 5. Dependencies

- `code--dependency_scan` already passing (no high/critical CVEs as of prior
  hardening pass).
- No unused npm packages confirmed safe to remove this pass (knip flags many
  shadcn UI primitives as unused, but they are kept as library surface).

### 6. Tests

- Vitest reliability suite (`src/test/reliability.test.tsx`) and Playwright
  E2E suite already in place from Phase 9.x; no missing coverage blocking
  release.

## Architecture

The current `pages/ + components/ + hooks/` layout is shallow but readable at
the present scale. Promoting to `src/features/<domain>/` is recommended once
two or more of the >500-LOC pages above are split, to avoid moving large
monoliths twice.

## Result

- 19 files deleted, ~1,800 LOC removed, zero behavior change.
- `tsgo --noEmit` clean after deletions.
- Remaining items are tracked refactors with non-trivial risk; they are
  intentionally deferred to focused follow-up changes per file.
