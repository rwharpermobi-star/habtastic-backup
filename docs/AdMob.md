# Google AdMob in HabTastic AI

Ads are shown **only to free users inside the native Android/iOS app**. Premium
(paid or trialing) users, signed-out users and the web app never see ads.

## Architecture

| File | Role |
| --- | --- |
| `src/lib/ads/adConfig.ts` | Ad unit IDs from env vars, Google TEST IDs as fallback, cooldown/cap constants |
| `src/lib/ads/adService.ts` | The only module that talks to `@capacitor-community/admob`: init, UMP consent, interstitial (cooldown), rewarded |
| `src/hooks/useAds.ts` | Single source of truth for "should this user see ads?" (server profile + premium state) |
| `src/hooks/useRewardedAd.ts` | Optional rewarded flow, calls the `admob-reward` edge function |
| `src/components/AdConsentHost.tsx` | Starts the SDK and consent flow early for Free users (no banner ads) |
| `src/components/WatchAdRewardCard.tsx` | Optional "watch for coins" entry point |
| `supabase/functions/admob-reward/index.ts` | Server-side reward grant (amount, daily cap, cooldown) |

Every ad call is wrapped in try/catch and resolves quietly on failure, no-fill,
timeout or offline — ads can never block app startup or show an error screen.

## Environment configuration

Set these as build-time Vite env vars (e.g. in `.env.production` or CI):

```
VITE_ADMOB_LIVE=true            # required to leave test mode
VITE_ADMOB_APP_ID=ca-app-pub-XXXXXXXX~XXXXXXXX
VITE_ADMOB_INTERSTITIAL_ID=ca-app-pub-XXXXXXXX/XXXXXXXX
VITE_ADMOB_REWARDED_ID=ca-app-pub-XXXXXXXX/XXXXXXXX
```

Without `VITE_ADMOB_LIVE=true` the app always uses Google's official test ad
units and `isTesting: true`, so accidental clicks during QA cannot put the
AdMob account at risk.

The native app ID also lives in `android/app/src/main/AndroidManifest.xml`
(`com.google.android.gms.ads.APPLICATION_ID`) — it is configured with the live
HabTastic AI App ID. Development and preview builds still use Google's official test ad units.
Package name stays `app.lovable.habtastic`.

## Placement rules

- Banners: none. Banner ads were removed (Nov 2026); the AdMob banner unit is
  left in the AdMob account but unused.
- Interstitials: only after a *fully completed* habit day, minimum 7 minutes
  apart, max 15/day. Never at launch, sign-in, checkout, habit saving or in any
  critical flow.
- Rewarded: fully optional, user-initiated. 20 coins per ad, max 5/day, 2 min
  cooldown — all enforced server-side in `admob-reward`.

## Consent / privacy

`adService.initAds()` runs the Google User Messaging Platform flow
(`requestConsentInfo` → `showConsentForm`) before any ad request, so
personalized ads are not requested before consent where consent is required.
Declare "Advertising ID" and advertising data usage in the Play Data Safety form.
