# Android Branding Fix — "HabTastic Ai" + Official Logo

Branding only. No changes to auth, Firebase, OAuth, Supabase, Paystack, AdMob, signing, notifications, or app screens. Package ID stays `app.lovable.habtastic`.

## 1. Visible app name → "HabTastic Ai"

Current value everywhere is `HabTastic AI` (capital I). Change the user-visible strings only:

- `android/app/src/main/res/values/strings.xml` — `app_name` and `title_activity_main` → `HabTastic Ai` (leave `package_name` and `custom_url_scheme` untouched).
- `capacitor.config.ts` — `appName: 'HabTastic Ai'` (`appId` unchanged).
- `public/manifest.json` — `name` and `short_name` → `HabTastic Ai`.
- `index.html` — visible title, `apple-mobile-web-app-title`, author/og/twitter/JSON-LD brand names → `HabTastic Ai`.

No URLs, keys, or identifiers change.

## 2. Official launcher icon

Source of truth: existing `resources/icon.png` (navy background, purple leaf + blue checkmark) — confirmed as the official logo, used unmodified.

- Add `resources/icon-foreground.png`: the same artwork scaled down onto a transparent canvas with generous safe-zone padding, so adaptive masks never crop the leaf or checkmark.
- Keep `resources/icon-background.png` as a flat dark-navy fill sampled from the logo.
- Regenerate native resources with the already-installed `@capacitor/assets` tooling, producing `ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`, `ic_launcher_background.png` in `mipmap-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi`, plus the `mipmap-anydpi-v26/ic_launcher*.xml` adaptive definitions.
- Confirm `AndroidManifest.xml` keeps `android:icon="@mipmap/ic_launcher"` and `android:label="@string/app_name"` (already correct).
- Refresh the PWA icon set in `public/icons/` (including maskable variants), `public/app-icon-512.png`, and favicons from the same artwork.

## 3. No path back to the default icon

- Remove any stale/unused launcher art left in `mipmap-ldpi` or elsewhere that isn't part of the generated set.
- The CI build regenerates icons from `resources/` after `cap sync`, so the Capacitor template icon cannot reappear; the verification script (below) fails the build if it ever does.

## 4. Icon verification script

`scripts/verify-android-icons.mjs` already checks densities, adaptive XMLs, template-identity, and palette. Keep all existing checks; only adjustments:

- Extend the palette check to also assert the dark-navy background is present (so a random purple image can't pass).
- Add a stale-asset check: fail if launcher bitmaps exist in densities outside the generated set.
- Update log wording to "HabTastic Ai".

## 5. Versioning (no regression)

Play currently has ~versionCode 165. Keep the run-number scheme with a floor guard:

- `scripts/configure-android-version.mjs`: raise the minimum accepted version code to 166 and compute `versionCode = max(run_number, 166)`.
- `.github/workflows/android-build.yml` and `android-play-release.yml`: `ANDROID_VERSION_CODE` stays `github.run_number`, and `ANDROID_VERSION_NAME` becomes `1.0.<effective versionCode>` so the name tracks the code (never moving backwards from 1.0.165).
- `android/app/build.gradle` fallbacks bumped to `166` / `1.0.166`.
- Existing CI steps that verify the APK/AAB internal manifest versionCode/versionName stay in place.

## 6. Verification before completion

1. Run the icon verification script.
2. Run typecheck.
3. Run the test suite.
4. Grep `strings.xml` and `capacitor.config.ts` for exactly `HabTastic Ai`.
5. Render the generated `mipmap-xxxhdpi/ic_launcher.png` and adaptive foreground so you can see the final icon.
6. Confirm package ID is still `app.lovable.habtastic`.
7. Confirm the computed next versionCode is > 165.

You trigger the Android Build (APK + AAB) workflow afterwards; signed binaries can't be produced in this environment.
