---
name: Security Hardening
description: Server-authoritative economy — RPC grant map, safe client wrappers, Android push contract
type: feature
---
# Security Hardening

## Grant map — internal primitives are NOT client-callable
`anon` and `authenticated` have **no** EXECUTE on:
`update_profile_internal`, `award_xp`, `award_coins`, `spend_coins`,
`award_celebration`, `qualify_referral_payment`, `adjust_gems_internal`.
Only `service_role` (and SECURITY DEFINER callers owned by `postgres`) may run them.
Never re-grant these — call a wrapper instead.

Column-level UPDATE on `profiles` is revoked from `authenticated` for
`xp`, `coins`, `gems`, `is_premium`, `premium_until`.

## Client-callable wrappers (authenticated EXECUTE, all derive values server-side)
| RPC | Signature | Returns | Client hook |
|---|---|---|---|
| `claim_action_reward` | `(_action text, _ref_id uuid, _ref_key text)` | `{xp,coins,gems}` | useHabits, useXPReward, useDailyChallenge, useCurrency |
| `start_my_trial` | `()` — no args | `{trial_started_at}` | useProfile |
| `my_best_habit_streak` | `()` | int | streak milestone proof |
| `roll_surprise_reward` | `()` | `{reward:{type,amount,rarity}\|null}` | useSurpriseReward |
| `use_streak_shield` | `(_date date)` | jsonb (`ok:false` + `reason` on decline) | useStreakFreeze |
| `buy_streak_shield` | `()` | `{ok,shields,xp_spent}` | useStreakFreeze |
| `auto_save_streak_day` | `(_date date)` | jsonb (`ok:false` + `reason` on decline) | useStreakSaver |
| `consume_ai_message` | `()` | `{allowed,unlimited,used,limit}` | usePremium |
| `spend_my_coins` / `spend_my_gems` | `(_amount int, _reason text)` | boolean | useCurrency |
| `update_my_profile_state` | `(_updates jsonb)` | void | useProfile |

### Every claim_action_reward action needs PROOF (never `_ref_key`)
| action | proof the server checks | claim-once key |
|---|---|---|
| `habit_complete` / `habit_undo` | owned habit + `completions` contains today | `award_xp` unique index |
| `journal_write` / `journal_voice` / `journal_ai_feedback` | owned `journal_entries` row; `is_voice` must match; `ai_feedback` must be non-empty | entry id |
| `challenge_day` | >=3 habits (or all, if <3) completed today | date |
| `streak_7` / `streak_30` / `streak_100` | `my_best_habit_streak()` >= milestone | action (once ever) |
| `daily_login` | the authenticated call itself | date |

Anything not in that table raises `unknown_action`. **Deleted from `reward_rules`
on purpose** — they were forgeable and each has a trusted server path:
`referral` (qualify_referral_payment), `habit_verification`
(submit_habit_verification), `daily_reflection` (submit_daily_reflection),
`gem_weekly_consistency` / `gem_challenge_complete` / `gem_level_up`
(claim_level_rewards + challenge RPCs). There is **no client-callable
gem-minting path**; `useCurrency.earnGems` is a deliberate no-op.

Claim-once is enforced by `public.reward_claims(user_id, action, source_key)` PK
(server-write only, owner SELECT). Never add an action that can't be proven from
authoritative state.

### Surprise rewards are earned, not rolled at will
`roll_surprise_reward()` consumes one row from
`public.reward_eligibility(user_id, kind='surprise_roll', source_key)` with
`FOR UPDATE SKIP LOCKED`. Eligibility is banked only inside a verified
`claim_action_reward('habit_complete')` (keyed `habit:date`). No eligibility ->
`{reward:null, reason:'not_eligible'}`. A rate limit alone is NOT sufficient —
it only slows farming down.

### Trial can never grant Premium
`start_my_trial()` takes **zero arguments** and writes `now()` only when
`trial_started_at IS NULL`. `update_my_profile_state({trial_started_at})`
discards the supplied value and delegates to it. `user_is_premium()` bounds the
trial window on **both** sides (`<= now()` AND `> now() - 5 days`) — a
one-sided check let a year-2099 timestamp mean Premium forever.

Rules:
- Reward sizes live in `public.reward_rules` (read-only for clients) and, for
  habits, are derived from `habits.difficulty`. **Never** pass an amount from
  the client — no wrapper accepts one.
- `claim_action_reward('habit_complete'|'habit_undo')` requires `_ref_id` and
  re-reads `habits.completions` to confirm today's state, so the DB write must
  land BEFORE the claim. Undo pays negative XP, no coin clawback.
- `useXPReward` must not send `habit_complete` (no habit id) — useHabits owns it.
- Some wrappers decline with `{ok:false, reason}` instead of raising. Always
  check `data.ok` as well as `error`.
- Repeatable-per-day actions have `reward_rules.dedupe_daily = false`
  (journal_*); everything else is deduped per day inside `award_xp`.

## Idempotency
- `award_xp` deduped per `(user_id, habit_id, date)` via `xp_habit_complete_unique`.
- Paystack: `paystack_webhook_events.event_hash` UNIQUE + `premium_grants` row-insert gate.
- Challenge payouts via `challenge_payouts` PK.

## RESTRICTIVE (service_role writes only)
`coin_transactions`, `xp_transactions`, `gem_transactions`, `premium_grants`,
`weekly_scores`, `challenge_payouts`, `referrals`, `rate_limits`,
`community_feed`, `leaderboard_crowns`.

## AI quota is enforced in the edge function
`supabase/functions/ai-coach/index.ts` calls `consume_ai_message()` **itself**,
after payload validation and before any model call. The `usePremium()` hook
calling it is a UX affordance only — a modified client that invokes `ai-coach`
directly still spends a message and gets 429 `ai_limit_reached` at the cap.
Never move this check back into React alone.

## Premium
`user_is_premium(uid)` / `require_premium()` are the server checks.
`usePremium()`'s localStorage cache is a UX hint only. Premium can only change
from Paystack / Play Billing / referral / admin service-role paths.

## Android push contract (all four must agree)
1. `AndroidManifest.xml` — `POST_NOTIFICATIONS`, `default_notification_channel_id=habtastic_default`, `default_notification_icon=@drawable/ic_stat_habtastic`, `default_notification_color=@color/habtastic_notification`
2. `src/hooks/useNativePush.ts` — `ANDROID_CHANNEL_ID` + `createChannel`
3. `supabase/functions/_shared/nativePush.ts` — FCM v1, `channel_id`, `icon`
4. `android/app/google-services.json` — client for `app.lovable.habtastic`

`ic_stat_habtastic` MUST be a monochrome white vector (Android draws small icons
as an alpha mask; a launcher mipmap renders as a white square).
`scripts/verify-push-config.mjs` (`npm run verify:push`) enforces all of this and
runs in `android-build.yml` after `npx cap sync android`.

`FCMDebug` must only ever render a **masked** token (`maskToken()`) — a raw
registration token is a bearer credential for pushing to that device.

`send-test-push` sends to the caller's own `device_tokens` (native FCM/APNs) AND
`push_subscriptions` (web), and prunes tokens FCM reports as UNREGISTERED.
Target user always comes from the JWT.

## Test suites
- `src/test/security.test.ts` — anon exploit primitives.
- `src/test/security-authenticated.test.ts` — real signed-in non-admin attacker:
  direct primitive calls, protected columns, inflated amounts, double-claim,
  cross-user, ledger inserts, and a before/after balance invariant.
  Needs `E2E_EMAIL`/`E2E_PASSWORD`; skips otherwise.
  **Non-mutating by contract:** a warm-up phase drains today's `daily_login`
  claim and any banked eligibility BEFORE the baseline snapshot, so the closing
  invariant asserts exact `before === after` for xp/coins/gems/is_premium/
  premium_until/streak_freezes/trial_started_at with zero tolerance. Do not
  reintroduce a tolerance window.
- `src/lib/__tests__/rlsWriteProtection.test.ts` — money tables.
- `supabase/functions/security-verify` — admin-gated post-deploy contract sweep.
  Use `service.auth.getUser(token)` on floating `npm:@supabase/supabase-js@2`;
  `auth.getClaims()` does not exist and returns opaque 500s.

## Known manual step
Leaked-password protection (HIBP) is Supabase **Dashboard** config on this
external project (`votldorvfuktonwewuhm`) and cannot be set from Lovable:
Authentication → Passwords → "Prevent use of leaked passwords".
