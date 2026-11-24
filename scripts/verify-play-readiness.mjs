#!/usr/bin/env node
/**
 * Google Play production-readiness checks for HabTastic AI.
 *
 * Fails the build when a Play requirement that can be verified locally has
 * regressed. Console-side requirements (developer verification, products,
 * testing, service-account permissions, Data safety answers, etc.) are tracked
 * separately because they require Play Console access.
 */
import { readFileSync, existsSync } from 'node:fs';

const APP_ID = 'app.lovable.habtastic';
const APP_NAME = 'HabTastic AI';
const PLAY_TARGET_API = 36;
const errors = [];
const warnings = [];
const passed = [];

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const check = (label, condition, hint) => condition ? passed.push(label) : errors.push(`${label} — ${hint}`);
const warn = (label, condition, hint) => condition ? passed.push(label) : warnings.push(`${label} — ${hint}`);

const buildGradle = read('android/app/build.gradle') ?? '';
const strings = read('android/app/src/main/res/values/strings.xml') ?? '';
const manifest = read('android/app/src/main/AndroidManifest.xml') ?? '';
const capacitorConfig = read('capacitor.config.ts') ?? '';
const variables = read('android/variables.gradle') ?? '';
const pricingPage = read('src/pages/Pricing.tsx') ?? '';
const billingLib = read('src/lib/googlePlayBilling.ts') ?? '';
const billingHook = read('src/hooks/useGooglePlayBilling.ts') ?? '';
const playVerify = read('supabase/functions/google-play-verify/index.ts') ?? '';
const playRtdn = read('supabase/functions/google-play-rtdn/index.ts') ?? '';
const playBillingDocs = read('docs/GooglePlayBilling.md') ?? '';
const playEntitlementMigration = read('supabase/migrations/20260918191000_google_play_entitlement_trigger.sql') ?? '';

// --- Identity -----------------------------------------------------------
check('Application ID is app.lovable.habtastic', buildGradle.includes(`applicationId "${APP_ID}"`), 'applicationId must match the Play Console listing');
check('Namespace matches application ID', buildGradle.includes(`namespace = "${APP_ID}"`), 'android.namespace must match the applicationId');
check('Launcher label is "HabTastic AI"', strings.includes(`<string name="app_name">${APP_NAME}</string>`), 'app_name must match the store listing name');
check('Activity title is "HabTastic AI"', strings.includes(`<string name="title_activity_main">${APP_NAME}</string>`), 'title_activity_main must match the store listing name');
check('Capacitor appName is "HabTastic AI"', capacitorConfig.includes(`appName: '${APP_NAME}'`) || capacitorConfig.includes(`appName: "${APP_NAME}"`), 'capacitor.config.ts appName must match the store listing');

// --- Versioning ---------------------------------------------------------
check('versionCode is CI-driven', /ANDROID_VERSION_CODE/.test(buildGradle), 'versionCode must come from ANDROID_VERSION_CODE so every upload is unique');
check('versionName is CI-driven', /ANDROID_VERSION_NAME/.test(buildGradle), 'versionName must come from ANDROID_VERSION_NAME');
check('Version-code floor is guarded above published Play version', /PUBLISHED_VERSION_CODE\s*=\s*200790/.test(read('scripts/configure-android-version.mjs') ?? ''), 'keep the versionCode floor above the latest published Play version');

// --- API level ----------------------------------------------------------
const targetSdk = Number(/targetSdkVersion\s*=\s*(\d+)/.exec(variables)?.[1] ?? 0);
check(`targetSdkVersion ${targetSdk} meets the August 31, 2026 new-app requirement (${PLAY_TARGET_API})`, targetSdk >= PLAY_TARGET_API, 'new apps and updates must target Android 16 / API 36 from August 31, 2026');
const compileSdk = Number(/compileSdkVersion\s*=\s*(\d+)/.exec(variables)?.[1] ?? 0);
check(`compileSdkVersion ${compileSdk} is at least targetSdkVersion`, compileSdk >= targetSdk, 'compile SDK must not be lower than target SDK');
const minSdk = Number(/minSdkVersion\s*=\s*(\d+)/.exec(variables)?.[1] ?? 0);
warn(`minSdkVersion ${minSdk} is reasonable`, minSdk >= 23, 'review support for very old Android devices before release');

// --- Signing ------------------------------------------------------------
check('Release signing config present', /signingConfigs\s*\{[\s\S]*release/.test(buildGradle), 'a release signingConfig is required — Play rejects unsigned/debug-signed bundles');
check('Keystore is env/properties driven (no committed secrets)', buildGradle.includes('ANDROID_KEYSTORE_PASSWORD') && !/storePassword\s+"/.test(buildGradle), 'never commit keystore passwords');
check('No keystore committed to the repo', !existsSync('android/app/release.keystore') && !existsSync('android/keystore.properties'), 'remove committed keystore/keystore.properties');
check('Release build is not configured as debuggable', !/debuggable\s*=\s*true/.test(buildGradle), 'release builds must not be debuggable');

// --- Payments / Google Play Billing ------------------------------------
check('Google Play Billing permission declared', manifest.includes('com.android.vending.BILLING'), 'digital subscriptions sold inside the Play app must use Play Billing');
check('Native Android routes Premium purchases to Play Billing', billingLib.includes('return isNativeAndroid();') && pricingPage.includes('play.purchase(selected)'), 'Android must not open Paystack for digital Premium purchases');
check('Web/non-Android keeps Paystack isolated', billingLib.includes('return !shouldUsePlayBilling();') && pricingPage.includes('startCheckout(selected)'), 'keep Paystack available only outside the native Android purchase flow');
check('Play monthly product ID is stable', billingLib.includes("habtastic_premium_monthly") && playBillingDocs.includes("habtastic_premium_monthly"), 'monthly Play product ID must match Play Console');
check('Play yearly product ID is stable', billingLib.includes("habtastic_premium_yearly") && playBillingDocs.includes("habtastic_premium_yearly"), 'yearly Play product ID must match Play Console');
check(
  'Play Premium activation is provider-webhook authoritative',
  billingLib.includes("google-play-verify") &&
    playVerify.includes('purchases.subscriptionsv2') &&
    !playVerify.includes('.from("profiles").update') &&
    !playVerify.includes('.from("subscriptions")') &&
    playRtdn.includes('oauth2.googleapis.com/tokeninfo') &&
    playRtdn.includes('purchases/subscriptionsv2/tokens') &&
    playRtdn.includes('source: "google_play_rtdn"') &&
    playEntitlementMigration.includes("metadata->>'source', '') = 'google_play_rtdn'"),
  'client verification must be read-only; only Google-authenticated RTDN may persist provider state that can activate Premium',
);
check('New Play subscriptions are acknowledged after entitlement save', playRtdn.includes('ACKNOWLEDGEMENT_STATE_PENDING') && playRtdn.includes(':acknowledge') && playRtdn.indexOf(':acknowledge') > playRtdn.indexOf('.upsert(row'), 'unacknowledged purchases are refunded and revoked by Google Play');
check('Native subscription management opens Google Play', pricingPage.includes('play.manage()'), 'Android subscription cancellation/management should use Google Play');

// --- Manifest / OAuth / ads --------------------------------------------
check('Google OAuth return path registered', manifest.includes('android:scheme="lovable"') && manifest.includes('android:host="oauth-callback"'), 'Google Sign-In has no return path without this intent filter');
check('AdMob application ID declared', manifest.includes('com.google.android.gms.ads.APPLICATION_ID'), 'AdMob requires an application ID meta-data entry');
check('Advertising ID permission declared', manifest.includes('com.google.android.gms.permission.AD_ID'), 'AdMob on Android 13+ may use the advertising ID and must declare the permission');
warn('AdMob uses a live application ID', !manifest.includes('ca-app-pub-3940256099942544~3347511713'), 'replace Google test configuration before production monetisation');

// --- Firebase -----------------------------------------------------------
const services = read('android/app/google-services.json');
warn('google-services.json present locally', !!services, 'CI injects Firebase config from the GOOGLE_SERVICES_JSON secret before the Android build');
if (services) {
  let matched = false;
  try {
    matched = JSON.parse(services).client?.some((c) => c.client_info?.android_client_info?.package_name === APP_ID);
  } catch {
    errors.push('google-services.json is not valid JSON');
  }
  check('Firebase config has a client for app.lovable.habtastic', matched, 'FCM/Google Sign-In configuration must match the Android package name');
}

// --- Native crash monitoring --------------------------------------------
check(
  'Crashlytics Gradle plugin dependency is configured',
  (read('android/build.gradle') ?? '').includes('firebase-crashlytics-gradle:3.0.8'),
  'Firebase Crashlytics requires the Gradle plugin in the root Android build',
);
check(
  'Crashlytics Gradle plugin is applied for Firebase release builds',
  buildGradle.includes("apply plugin: 'com.google.firebase.crashlytics'"),
  'android/app/build.gradle must apply the Crashlytics Gradle plugin when Firebase config is present',
);
const mainEntry = read('src/main.tsx') ?? '';
check(
  'Crashlytics native plugin is included',
  capacitorConfig.includes('@capacitor-firebase/crashlytics'),
  'native production errors should not silently lose the Crashlytics bridge',
);
check(
  'Crashlytics sink starts at app bootstrap',
  mainEntry.includes('startCrashlyticsSink();'),
  'src/main.tsx must start the native Crashlytics logger sink',
);

// --- Store policy pages -------------------------------------------------
const routes = read('src/App.tsx') ?? '';
const deleteAccountPage = read('src/pages/DeleteAccount.tsx') ?? '';
const deleteAccountFn = read('supabase/functions/delete-account/index.ts') ?? '';
check('Public privacy policy route exists', routes.includes('/privacy'), 'Play requires a reachable privacy policy URL');
check('Public account deletion route exists', routes.includes('/delete-account'), 'account-creating apps must provide an external deletion resource');
check(
  'Account deletion explains subscription cancellation',
  deleteAccountPage.includes('does not itself cancel an external paid') &&
    deleteAccountPage.includes('play.google.com/store/account/subscriptions'),
  'users must be told how to stop renewal before deleting an account',
);
check(
  'Account deletion covers shared relationship data',
  deleteAccountFn.includes('"friendships", columns: ["requester_id", "addressee_id"]') &&
    deleteAccountFn.includes('"referrals", columns: ["referrer_id", "referred_id"]') &&
    deleteAccountFn.includes('"user_blocks", columns: ["blocker_id", "blocked_id"]'),
  'deletion must remove rows where the user is stored outside a user_id column',
);
check('Terms route exists', routes.includes('/terms'), 'publish terms of service if they are referenced by the app/store listing');

// --- Icons --------------------------------------------------------------
const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const missingIcons = densities.filter((d) => !existsSync(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`));
check('Launcher icons present for every density', missingIcons.length === 0, `missing: ${missingIcons.join(', ')}`);
check('Play Store 512px icon present', existsSync('public/app-icon-512.png'), 'Play Console requires a 512x512 high-resolution icon asset');

// --- Report -------------------------------------------------------------
console.log(`\nGoogle Play readiness — ${passed.length} passed, ${warnings.length} warning(s), ${errors.length} error(s)\n`);
for (const p of passed) console.log(`  ok    ${p}`);
for (const w of warnings) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);

if (errors.length) {
  console.error(`\n::error::${errors.length} locally verifiable Google Play readiness check(s) failed.`);
  process.exit(1);
}
console.log('\nAll locally verifiable Google Play readiness checks passed. Console-side setup still required.\n');
