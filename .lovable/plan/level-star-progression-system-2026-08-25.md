# Level + Star Progression System

Turn XP into HabTastic AI's single long-term progression track: 50 levels, 5 stages, 5 stars, claim-once rewards, and a polished level-up celebration — built on the XP already stored in `profiles.xp`. No new currency, no XP reset, no duplicate systems, no redesign of unrelated screens.

## Audit of the XP that actually exists today

Confirmed from the code and the live `xp_transactions` ledger (not assumed):

| Source | XP | Notes |
| --- | --- | --- |
| Habit completion | 5 / 10 / 20 | easy / medium / hard, via `award_xp`, deduped per (habit, date) |
| Winston / daily challenge | 15–50 | server-capped 5–100 |
| Journal entry / voice / AI feedback | 15 / 20 / 10 | |
| Streak 7 / 30 bonus | 50 / 100 | |
| Surprise reward | ~23 avg | observed in ledger |
| Perfect day | **0** | shown on the XP Breakdown page but never actually awarded |
| Achievements | **0** | no XP payout today |

So a genuinely consistent user (5 medium habits + occasional challenge/journal) earns roughly **60–90 XP/day**, not the ~350 my earlier draft implicitly assumed. Perfect-day XP is display-only, and achievements pay nothing — I will **not** add new XP sources as part of this work (that would inflate every existing surface); I will tune the curve to the real earn rate instead.

## Corrected XP curve

Target: consistent user (~75 XP/day) reaches Level 50 in **~5–7 months** (150–210 days) → total budget ≈ **11,000–16,000 XP**. Casual users (~30 XP/day) land near 12+ months, which is the intended spread.

```text
xpToNextLevel(L) = Math.round(30 * Math.pow(L, 0.72) / 5) * 5
  L1→2 = 30      L5 ≈ 95      L10 ≈ 155
  L20  ≈ 260     L40 ≈ 425    L49→50 ≈ 495
  total L1 → L50 ≈ 14,315 XP  →  ~190 days at 75 XP/day
```

Fast, exciting early levels; smoothly steepening later. The pacing simulation test is the final authority — the coefficient/exponent only get nudged if the consistent profile falls outside the 150–210 day window.

Stages: 1–10 Beginner, 11–20 Builder, 21–30 Consistent, 31–40 Driven, 41–50 Master. Stars at exactly 10 / 20 / 30 / 40 / 50.

## Reward ladder — no gaps over 5 levels

Levels **2, 3, 5, 7, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50** (35 and 45 added per your note). Every reward reuses an existing system: coins via `award_coins`, frames/cosmetics via `cosmetic_items` + `user_cosmetics`, streak savers via `profiles.streak_freezes`, badges on the achievements surface, chests via the existing chest reward types. Star levels also carry the largest payout of their stage.

## What the user sees

**Home** — the existing hero avatar keeps its exact layout; a compact level chip + star row is added directly beneath it. Stars only render once earned. New star animates in on level-up.

**Progress page** — one "Progression" block added at the top of the existing content; nothing else on the page is restyled:

```text
  Level 23  ·  Consistent            180 / 430 XP
  [=========------------------]
  Next reward: Rare Chest — Level 25
  Next star:   3rd Star — Level 30
```

Growth Score, Coins, Streaks, Achievements and Rank stay exactly where they are, each getting a one-line caption ("this week's performance", "spendable", "consistency", "competitive") so they read as distinct from XP/Level.

**Leaderboard / Community profile** — compact stars beside each name.

**Level-up** — full-screen celebration: `LEVEL UP · Level 19 → 20`, stage title, star reveal, reward list. Milestone levels (10/20/30/40/50) get the bigger treatment; ordinary levels a lighter, shorter one.

## Technical section

**Migration**

- `public.level_rewards_claimed (user_id, level, rewards jsonb, claimed_at)`, primary key `(user_id, level)`. RLS: users read only their own rows; no client write path. Grants: `select` to `authenticated`, `all` to `service_role`.
- `public.claim_level_rewards()` — SECURITY DEFINER, fully transactional and concurrency-safe:
  1. locks the caller's profile row and derives the level **server-side** from `profiles.xp` (never from a client argument),
  2. `INSERT ... SELECT ... ON CONFLICT (user_id, level) DO NOTHING RETURNING level` — the returned set is the *only* thing that gets paid out, so simultaneous or repeated calls grant nothing twice,
  3. grants coins / cosmetics / streak savers only for those returned levels,
  4. returns the granted rewards for the celebration modal.
- **Backfill inside the migration itself** (no client-controlled parameter): for every existing profile, insert `level_rewards_claimed` rows for all reward levels already passed at their current XP, marked `rewards = '{"backfilled": true}'` with **no payout**. Result: existing users show their correct level and stars immediately, receive no retroactive coins, and no old reward can be re-claimed later.
- Level-up celebration suppression on first load: the client seeds its "last seen level" from the user's current derived level before comparing, so deployment never replays a chain of historical level-ups. Only levels crossed *after* that seed celebrate.
- New level-reward cosmetics inserted into `cosmetic_items` with `unlock_rule = {"type":"level","level":N}`.
- Leaderboard/community surfaces: `get_community_top_members` is extended to return **derived `level` and `stars` only** — raw `profiles.xp` exposure is not widened, and no existing RLS policy is loosened. Where a surface already has the viewer's own XP, it computes locally.

**New code**

- `src/lib/progression.ts` — single source of truth: `xpToNextLevel`, `getLevelFromXP` (new curve, same return shape), `MAX_LEVEL = 50`, stages, `getStars(level)`, `LEVEL_REWARDS`, `getNextReward`, `getNextStar`. Prestige-ready: a future Master I/II/III is a config addition, not a rewrite.
- `src/lib/habitStore.ts` re-exports from `progression.ts` so all existing callers pick up the curve with no signature change.
- `src/components/StarRating.tsx` (compact, `sm`/`md`, optional reveal animation), `src/components/LevelBadge.tsx`, `src/hooks/useLevelRewards.ts` (React Query wrapper around the claim RPC, invalidates profile + cosmetics caches), extended `LevelUpCelebration.tsx` (previous level, rewards, milestone flag; transform/opacity-only animations for Android, honours reduced-motion).

**Touched surfaces**: `Dashboard.tsx`, `Progress.tsx`, `Leaderboard.tsx` + `useLeaderboard.ts`, `CommunityProfile.tsx`, `Profile.tsx`. Untouched: habit logic, streak logic, coin economy rules, achievement criteria, Winston, Premium, referrals, auth, Paystack.

## Verification before completion

- Curve unit tests: monotonic, level 1 at 0 XP, caps at 50, star thresholds land at exactly 10/20/30/40/50, reward config has no duplicate levels and no gap greater than 5.
- Pacing simulation test using the audited real XP amounts for consistent / casual / heavy profiles; asserts the consistent profile lands in the 150–210 day window.
- **Regression tests for every existing `getLevelFromXP` consumer** — `useAchievements` (level-gated achievements), Dashboard level display and level-up detection, `Progress` level/progress values, `XPBreakdown`, and the weekly report PDF's `level * 2` scoring term — with fixed XP fixtures so the curve change's effect on each surface is explicit and reviewed rather than silent.
- SQL checks: double and concurrent `claim_level_rewards()` calls grant nothing twice; an existing user's XP and coin balance are unchanged after backfill; a backfilled level cannot later pay out.
- Mobile layout verified at 371px width; app restart preserves level/star state (derived from server XP, so nothing is client-persisted).
