# Google Play Console setup — HabTastic AI

Package name: `app.lovable.habtastic` · Store listing name: **HabTastic AI**

Billing details live in [GooglePlayBilling.md](./GooglePlayBilling.md); this doc covers the Play Console app itself and the release pipeline.

## 1. Required GitHub secrets

| Secret | Used for |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | base64 of the upload keystore |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |
| `GOOGLE_SERVICES_JSON` | base64 of `google-services.json` (FCM) |

The Google Play service-account JSON is also required as the production Supabase secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` for the `google-play-verify` Edge Function. Do not commit or paste private keys into source control.

## 2. Play service account (one-time)

1. Play Console → **Setup → API access** → link the Google Cloud project.
2. Google Cloud → create a service account, enable **Google Play Android Publisher API**, and create a JSON key.
3. Play Console → **Users and permissions** → invite the service-account email and grant the minimum app-level permissions needed to verify subscriptions and manage releases/orders.
4. Create the Play app and subscriptions before attempting a real billing test.

## 3. Release pipeline

- `.github/workflows/android-build.yml` — builds a signed APK + AAB on the configured release branch and runs the Play-readiness checks before producing artifacts.
- `.github/workflows/android-play-release.yml` — manual Play upload workflow when configured with the publisher credentials.

The legacy `.github/workflows/android-downloadable-release.yml` was removed because it duplicated the Android build/release pipeline.

`versionCode` is CI-driven and guarded above the latest published Play version. Never reuse a Play `versionCode`.

Recommended rollout: **internal testing** → verify on physical Android devices → closed/open testing as required by the developer account → production with a staged rollout.

## 4. Production readiness checks

`node scripts/verify-play-readiness.mjs` verifies locally-checkable requirements including:

- application ID / namespace / launcher label / Capacitor `appName`
- CI-driven versioning and version-code floor
- **targetSdkVersion 36 / Android 16** for new-app submissions from August 31, 2026
- release signing configuration with no committed private keys
- Play Billing permission and native Android Play Billing routing
- stable monthly/yearly Play product IDs
- server-side Google Play purchase verification
- AdMob application ID and `AD_ID` permission
- Google OAuth `lovable://oauth-callback` return path
- Firebase configuration for `app.lovable.habtastic`
- public privacy, terms and account-deletion routes
- launcher icons and 512px store icon

Console-side requirements cannot be verified from source code and must still be completed in Play Console.

## 5. Store listing checklist (manual, in Play Console)

- [ ] App name `HabTastic AI`, short description and full description
- [ ] 512×512 icon (`public/app-icon-512.png`)
- [ ] 1024×500 feature graphic
- [ ] At least 2 phone screenshots
- [ ] Privacy policy URL: `https://habtastic.com/privacy`
- [ ] Account deletion URL: `https://habtastic.com/delete-account`
- [ ] Data safety form accurately declares account/profile data, user-created habit/journal/goal data, device/usage identifiers, advertising ID, diagnostics/telemetry, and microphone/audio handling if voice input is enabled
- [ ] Ads declaration: **contains ads** for free users
- [ ] Content rating questionnaire completed
- [ ] Target audience and other App content declarations completed accurately
- [ ] Google Play subscriptions `habtastic_premium_monthly` and `habtastic_premium_yearly` created, priced and active
- [ ] App access/reviewer instructions and a reusable review account supplied if login is required
- [ ] Developer identity/payment/profile verification completed
- [ ] Data deletion questions completed

## 6. New personal developer accounts

If this is a personal developer account created after November 13, 2023, check whether the account is subject to Google's closed-testing gate. The current requirement is a closed test with at least 12 opted-in testers continuously for 14 days before applying for production access.

## 7. Final device test matrix

Before production submission, test the signed AAB from Google Play internal testing on a physical Android device:

- [ ] Fresh install / first launch / no blank screen
- [ ] Email sign-in and Google Sign-In
- [ ] Password reset
- [ ] Push notification permission and an actual FCM notification
- [ ] Free tier: 4 active habits and 5 Winston messages/day
- [ ] Free Money Saver: 1 active goal; second goal is blocked with Premium explanation
- [ ] Premium: unlimited habits, Winston and Money Saver goals
- [ ] Google Play monthly purchase
- [ ] Google Play yearly purchase
- [ ] Restore purchase
- [ ] Subscription management/cancellation through Google Play
- [ ] Premium entitlement survives logout/login and app restart
- [ ] AdMob displays only where intended and never blocks startup
- [ ] Account deletion from inside the app and external deletion page
- [ ] Offline/reconnect behavior
- [ ] OAuth deep link return
- [ ] Notification/deep-link behavior when the app is closed
