# Google Play Billing (Android) — HabTastic AI

Google Play policy requires digital subscriptions sold inside the Android app to
use Google Play Billing. Paystack remains the checkout for **web only** and is
never opened from the native Android build.

## Play Console products (create exactly these IDs)

| Plan | Subscription product ID | Android base plan ID | Billing period |
| --- | --- | --- | --- |
| Monthly Premium | `habtastic_premium_monthly` | `monthly` | 1 month, auto-renewing |
| Yearly Premium | `habtastic_premium_yearly` | `yearly` | 1 year, auto-renewing |

Package name: `app.lovable.habtastic`

Both base plans must be **active** and have at least one region/price set,
otherwise `getProducts()` returns nothing and Android checkout is unavailable.

## Required Supabase secret

| Secret | Value |
| --- | --- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | The full JSON key file of a Google Cloud service account with Play Android Publisher access |

Add it in **Project Settings → Secrets**. Without it, the
`google-play-verify` Edge Function fails closed (HTTP 503) and Premium is never
granted.

## Remaining external configuration steps (after Google verifies the developer account)

1. Create the app `app.lovable.habtastic` in the Play Console (internal testing
   track is enough to test purchases).
2. Create the two subscriptions and base plans exactly as listed above, then
   activate them.
3. Google Cloud Console → the project linked to Play → create a service account,
   create a JSON key, and enable the **Google Play Android Publisher API**.
4. Play Console → *Users and permissions* → invite the service-account email and
   grant "View financial data" + "Manage orders and subscriptions" (app-level is
   enough).
5. Paste the JSON key into the Supabase secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
6. Create a Google Cloud Pub/Sub topic for Google Play Real-time Developer
   Notifications (RTDN). Configure an authenticated push subscription to:
   `https://votldorvfuktonwewuhm.supabase.co/functions/v1/google-play-rtdn`.
   Use that exact URL as the OIDC audience.
7. Play Console → Monetize → Monetization setup → Real-time developer
   notifications: connect the Pub/Sub topic and send a test notification.
8. Upload a signed AAB to internal testing, add licensed testers, and run a real
   purchase from a test account. Client verification is read-only; Premium is
   activated only after the Google-authenticated RTDN webhook independently
   verifies the purchase with Android Publisher API.

## Implementation map

- `src/lib/googlePlayBilling.ts` — product IDs, platform routing helpers
  (`shouldUsePlayBilling` / `shouldUsePaystack`), price loading, purchase,
  restore, and Play subscription management.
- `src/hooks/useGooglePlayBilling.ts` — React state wrapper (no-op on web).
- `src/pages/Pricing.tsx` — on native Android uses Play prices + Play purchase,
  restore re-verifies server-side, and "Manage" opens Play subscriptions
  instead of calling `paystack-cancel`.
- `supabase/functions/google-play-verify/index.ts` — authenticated, read-only
  client verification. It validates the purchase against Android Publisher API
  but never writes subscription or Premium state.
- `supabase/functions/google-play-rtdn/index.ts` — Google Pub/Sub RTDN webhook.
  It validates Google's OIDC token, independently re-queries Android Publisher
  API, writes the server-owned `subscriptions` row, then acknowledges any new
  verified subscription purchase. A failed acknowledgement returns an error so
  Pub/Sub retries; Google refunds unacknowledged new purchases.
- `supabase/migrations/20260918191000_google_play_entitlement_trigger.sql` —
  server-side entitlement trigger. Only a Google-verified subscription row with
  `verification_authority = google_play_api` can extend Premium.

## Native notes

- Plugin: `@capgo/native-purchases` (subscriptions via `PURCHASE_TYPE.SUBS`).
- `com.android.vending.BILLING` is declared explicitly in
  `android/app/src/main/AndroidManifest.xml` so it never depends on manifest
  merging.
- `MainActivity` keeps `launchMode="singleTask"`, which is compatible with the
  billing flow and required for the existing Google OAuth deep link.
- The signed-in Supabase user id is sent as `appAccountToken`
  (Google Play `obfuscatedExternalAccountId`) and re-checked during verification.

After changing native config run:

```bash
npm install && npx cap sync android
```
