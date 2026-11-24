# Verify instant avatar flow with a signed-in account

## Goal
Prove the full instant-avatar flow against the live backend (external Supabase `votldorvfuktonwewuhm`) with a signed-in account: private-bucket upload, signed URL creation, and profile refresh. No AI credits touched, no changes to AI/credit logic.

## Already verified (read-only, this turn)
- `storage.buckets`: `avatars` is private (`public: false`).
- RLS on `storage.objects`: owner-scoped INSERT/UPDATE/DELETE policies plus a SELECT policy scoped to the user's own folder (`20260804003152`).
- `saveInstantAvatar` uploads `{userId}/instant-avatar-{id}.svg` (PNG fallback), creates a 5-year signed URL, validates the image loads, saves `avatar_url` to the profile, and refetches to confirm. It never calls the AI provider or any credit RPC.

## Blocked check and how we unblock it
This backend is an external (unmanaged) Supabase project, so Lovable cannot mint a browser session and the existing `test@habtastic.com` password is unknown to us. To sign in for real, we deploy a short-lived edge function that uses the project's internal service-role credentials (server-side only, never exposed to the client) to:
1. Create a fresh throwaway test user with our own password and mark its email confirmed.
2. After verification, delete the test user and the function.

## Verification steps (Playwright against http://localhost:8080)
1. **Pre-checks:** run the existing instant-avatar unit tests (`instantAvatar.test.ts`, `AvatarPickerInstant.test.tsx`) and confirm they pass.
2. **Sign in:** create the throwaway user via the temporary function, then sign in through the app's own sign-in UI in Playwright.
3. **Record baseline:** capture the profile's `ai_avatar_credits_used` before the test.
4. **Run the flow:** open Profile → avatar picker → click "Create instant avatar".
   - Network: confirm an upload `POST /storage/v1/object/avatars/{uid}/instant-avatar-*.svg` (or `.png`) returns 200.
   - Network: confirm a signed-URL request `POST /storage/v1/object/sign/avatars/{uid}/...` returns 200 with a `signedUrl`.
   - Confirm the signed URL loads the image (HTTP 200, non-empty).
5. **Profile refresh:** confirm the profile query refetches and `avatar_url` equals the new signed URL; confirm the picker dialog closes with the success toast and the header/profile picture updates.
6. **Persistence:** reload the page and confirm the avatar still displays from the stored URL.
7. **No credit impact:** confirm `ai_avatar_credits_used` is unchanged and no request hit the `generate-avatar` function during the flow.
8. **Private-bucket check:** fetch the raw object path without a signature — expect a 400/error (proves the bucket is not public).
9. **Cleanup:** delete the test user's avatar objects, delete the test user, and remove the temporary edge function.

## Scope guards
- No changes to AI generation, credits, schema, or RLS — verification only, plus the temporary test-user function which is removed afterwards.
- If any step fails, fix the instant-avatar code path only (with a test), rerun, and report exactly which step failed.

## Report
Report what was observed per step (upload status, signed URL, profile URL, persistence, credit invariance, private-bucket denial). Do not claim success for anything not exercised.
