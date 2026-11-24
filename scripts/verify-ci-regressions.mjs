import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const passed = [];

const read = (relativePath) => {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
};

const ok = (label) => passed.push(label);
const fail = (label, detail) => errors.push(`${label}: ${detail}`);

const requireText = (label, content, needle) => {
  if (content.includes(needle)) ok(label);
  else fail(label, `missing ${JSON.stringify(needle)}`);
};

const forbidText = (label, content, needle) => {
  if (!content.includes(needle)) ok(label);
  else fail(label, `forbidden value present: ${JSON.stringify(needle)}`);
};

const requireRegex = (label, content, regex) => {
  if (regex.test(content)) ok(label);
  else fail(label, `pattern not found: ${regex}`);
};

const requireCount = (label, content, needle, expected) => {
  const count = content.split(needle).length - 1;
  if (count === expected) ok(label);
  else fail(label, `expected ${expected} occurrence(s) of ${JSON.stringify(needle)}, found ${count}`);
};

const requireOrder = (label, content, first, second) => {
  const a = content.indexOf(first);
  const b = content.indexOf(second);
  if (a >= 0 && b >= 0 && a < b) ok(label);
  else fail(label, `${JSON.stringify(first)} must appear before ${JSON.stringify(second)}`);
};

const packageJson = read('package.json');
const bunLock = read('bun.lock');
const androidBuild = read('.github/workflows/android-build.yml');
const playRelease = read('.github/workflows/android-play-release.yml');
const postDeploy = read('.github/workflows/post-deploy-verify.yml');
const e2eWorkflow = read('.github/workflows/e2e.yml');
const playwright = read('playwright.config.ts');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const fileProviderPaths = read('android/app/src/main/res/xml/file_paths.xml');
const gradle = read('android/app/build.gradle');
const firebaseGradleHelper = read('scripts/ensure-google-services-plugin.mjs');
const indexHtml = read('index.html');
const securityHeaderVerifier = read('scripts/verify-security-headers.mjs');

// Lovable deep-scan security regression sources.
const dataMigration = read('supabase/functions/data-migration/index.ts');
const pushTokenRegister = read('supabase/functions/push-token-register/index.ts');
const pushSubscribe = read('supabase/functions/push-subscribe/index.ts');
const bankingSave = read('supabase/functions/banking-save/index.ts');
const notificationDispatcher = read('supabase/functions/notification-dispatcher/index.ts');
const supabaseConfig = read('supabase/config.toml');
const playVerify = read('supabase/functions/google-play-verify/index.ts');
const playRtdn = read('supabase/functions/google-play-rtdn/index.ts');
const playEntitlementMigration = read('supabase/migrations/20260918191000_google_play_entitlement_trigger.sql');
const accessControlMigration = read('supabase/migrations/20260918134233_fix_lovable_access_control_20260918.sql');
const legacyMfaMigration = read('supabase/migrations/20260729130833_111d28e4-cb9f-41c5-922a-9e29f33806fc.sql');
const authContext = read('src/contexts/AuthContext.tsx');
const resetPassword = read('src/pages/ResetPassword.tsx');
const privacySettings = read('src/pages/PrivacySettings.tsx');
const pwnedPassword = read('src/lib/pwnedPassword.ts');
const pwnedPasswordRange = read('supabase/functions/pwned-password-range/index.ts');

// Baseline project/tooling invariants.
requireRegex('package is ESM', packageJson, /"type"\s*:\s*"module"/);
requireRegex('web build script exists', packageJson, /"build"\s*:\s*"vite build(?:\s+&&\s+[^"]+)?"/);
requireRegex('Bun text lockfile uses supported version (1 or 3)', bunLock, /"lockfileVersion"\s*:\s*[13]/);
requireRegex('Bun text lockfile config version exists', bunLock, /"configVersion"\s*:\s*1/);

for (const script of [
  'scripts/configure-android-version.mjs',
  'scripts/verify-android-artifact-versions.mjs',
  'scripts/verify-admob-production.mjs',
  'scripts/verify-push-config.mjs',
  'scripts/verify-play-readiness.mjs',
  'scripts/ensure-google-services-plugin.mjs',
]) {
  if (fs.existsSync(path.join(ROOT, script))) ok(`required verifier exists: ${script}`);
  else fail('required verifier missing', script);
}

// Android build regression guards.
requireText('Android build stays on GitHub-hosted cloud runner', androidBuild, 'runs-on: ubuntu-latest');
forbidText('Android build no longer requires Windows self-hosted runner', androidBuild, 'runs-on: [self-hosted, Windows, X64]');
requireRegex('Android build stays on Node 22', androidBuild, /node-version:\s*['"]?22['"]?/);
requireRegex('Android build stays on Java 21', androidBuild, /java-version:\s*['"]?21['"]?/);
requireText('Android build uses requested version code', androidBuild, 'ANDROID_REQUESTED_VERSION_CODE');
requireOrder('Android version is configured after Capacitor sync', androidBuild, 'npx cap sync android', 'node scripts/configure-android-version.mjs');
requireOrder('Artifact version verification runs after release build', androidBuild, './gradlew :app:assembleRelease :app:bundleRelease', 'node scripts/verify-android-artifact-versions.mjs');
requireText('Android final manifest uses aapt2', androidBuild, 'aapt2');
requireText('Android APK signature uses apksigner', androidBuild, 'apksigner');
requireText('Android build uploads signed artifacts to GitHub', androidBuild, 'actions/upload-artifact@v4');
for (const secret of [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
  'GOOGLE_SERVICES_JSON',
]) requireText(`Android build references ${secret}`, androidBuild, secret);
requireText('Android build verifies push config', androidBuild, 'node scripts/verify-push-config.mjs');
requireText('Android build verifies native OAuth scheme', androidBuild, 'android:scheme="lovable"');
requireText('Android build verifies native OAuth host', androidBuild, 'android:host="oauth-callback"');
requireText('Android build verifies production AdMob app ID', androidBuild, 'ca-app-pub-1971238777773206~4099124115');
requireText('Android build rejects Google AdMob test app ID', androidBuild, 'ca-app-pub-3940256099942544~3347511713');

// Play release regression guards.
requireText('Play release remains manual', playRelease, 'workflow_dispatch:');
forbidText('Play release cannot auto-publish on push', playRelease, '\n  push:');
requireText('Play release stays on GitHub-hosted cloud runner', playRelease, 'runs-on: ubuntu-latest');
requireRegex('Play release stays on Node 22', playRelease, /node-version:\s*['"]?22['"]?/);
requireOrder('Play release configures version after Capacitor sync', playRelease, 'npx cap sync android', 'node scripts/configure-android-version.mjs');
requireText('Play release verifies artifact versions', playRelease, 'node scripts/verify-android-artifact-versions.mjs');
requireText('Play release requires service account', playRelease, 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
requireText('Play release uploads through Google Play action', playRelease, 'r0adkll/upload-google-play@v1');
requireText('Play release package ID is fixed', playRelease, 'packageName: app.lovable.habtastic');

// Native Android source-of-truth guards.
requireText('Gradle applicationId is HabTastic', gradle, 'applicationId "app.lovable.habtastic"');
requireText('Gradle versionCode comes from CI env', gradle, 'System.getenv("ANDROID_VERSION_CODE")');
requireText('Gradle versionName comes from CI env', gradle, 'System.getenv("ANDROID_VERSION_NAME")');
for (const signingEnv of [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
]) requireText(`Gradle signing uses ${signingEnv}`, gradle, signingEnv);
requireText('Google services Gradle plugin stays applied', gradle, "apply plugin: 'com.google.gms.google-services'");
requireText('Crashlytics Gradle plugin stays applied in source', gradle, "apply plugin: 'com.google.firebase.crashlytics'");
requireText('Firebase helper preserves Crashlytics classpath', firebaseGradleHelper, 'com.google.firebase:firebase-crashlytics-gradle');
requireText('Firebase helper preserves Crashlytics app plugin', firebaseGradleHelper, 'com.google.firebase.crashlytics');
requireText('Firebase helper verifies combined plugin wiring', firebaseGradleHelper, 'Google Services + Crashlytics Gradle wiring verified');
requireText('Fail-closed frame guard marker stays present', indexHtml, 'habtastic-frame-deny-v1');
requireText('Frame guard hides embedded document on denial', indexHtml, "document.documentElement.style.display = 'none'");
requireText('Live security verifier checks client anti-framing fallback', securityHeaderVerifier, 'clientFrameFallback');

requireCount('Exactly one AdMob APPLICATION_ID declaration in source manifest', manifest, 'com.google.android.gms.ads.APPLICATION_ID', 1);
requireCount('Exactly one production AdMob app ID in source manifest', manifest, 'ca-app-pub-1971238777773206~4099124115', 1);
forbidText('Google AdMob test app ID absent from source manifest', manifest, 'ca-app-pub-3940256099942544~3347511713');
requireCount('Advertising ID permission declared exactly once', manifest, 'com.google.android.gms.permission.AD_ID', 1);
requireCount('Android 13 notification permission declared exactly once', manifest, 'android.permission.POST_NOTIFICATIONS', 1);
requireText('OAuth scheme remains registered', manifest, 'android:scheme="lovable"');
requireText('OAuth callback host remains registered', manifest, 'android:host="oauth-callback"');
requireText('FCM default channel stays configured', manifest, 'com.google.firebase.messaging.default_notification_channel_id');
requireText('FCM small icon stays configured', manifest, 'com.google.firebase.messaging.default_notification_icon');
requireText('Android app backups stay disabled', manifest, 'android:allowBackup="false"');
forbidText('Android app backups cannot be re-enabled', manifest, 'android:allowBackup="true"');
requireText('FileProvider stays limited to app-private cache', fileProviderPaths, '<cache-path');
forbidText('FileProvider cannot expose external storage root', fileProviderPaths, '<external-path');
forbidText('FileProvider cannot expose files-path root', fileProviderPaths, '<files-path');
forbidText('FileProvider cannot expose external-files root', fileProviderPaths, '<external-files-path');

// The expensive startup diagnostic and duplicate downloadable-release workflows were intentionally retired.
const playReadinessWorkflow = read('.github/workflows/play-readiness.yml');
requireText('Android build statically verifies production backend settings', androidBuild, 'node scripts/verify-supabase-production.mjs --assets android/app/src/main/assets/public');
forbidText('Android build does not require live Supabase connectivity', androidBuild, '--check-backend');
requireText('Play readiness statically verifies production backend settings', playReadinessWorkflow, 'node scripts/verify-supabase-production.mjs --assets android/app/src/main/assets/public');
forbidText('Play readiness does not require live Supabase connectivity', playReadinessWorkflow, '--check-backend');

// Playwright regression guard: the web server must not depend on Bun being on PATH.
requireText('Playwright CI web server starts through npm', playwright, "command: 'npm run dev'");
forbidText('Playwright CI web server does not require Bun', playwright, "command: 'bun run dev'");
requireText('Playwright job waits for cheap checks', e2eWorkflow, 'needs: checks');
requireText('Playwright browser cache remains enabled', e2eWorkflow, 'actions/cache@v4');

// Post-deploy security verifier regression guards.
requireRegex('Post-deploy verifier runs Node 22', postDeploy, /node-version:\s*['"]?22['"]?/);
requireText('Security reachability has connect timeout', postDeploy, '--connect-timeout 10');
requireText('Security verifier has bounded request timeout', postDeploy, '--max-time 75');
requireText('Security verifier retries transient HTTP statuses', postDeploy, '000|408|429|502|503|504');
requireText('Security verifier has five-attempt retry loop', postDeploy, 'for attempt in 1 2 3 4 5');
requireText('Admin verifier mints a fresh password token', postDeploy, 'grant_type=password');
requireText('Admin verifier uses dedicated admin password', postDeploy, 'secrets.VERIFY_ADMIN_PASSWORD');
forbidText('Admin verifier cannot silently reuse E2E password', postDeploy, 'secrets.E2E_PASSWORD');
requireText('Expired/rejected admin auth is maintenance, not RLS failure', postDeploy, '401|403');
requireText('Real RLS/RPC contract failure remains blocking', postDeploy, '422)');
requireText('Known internal security verifier errors remain blocking', postDeploy, 'role_lookup_failed');
requireRegex(
  'Admin request sends the freshly resolved token',
  postDeploy,
  /(?:Authorization: Bearer \$\{TOKEN\}|VERIFY_ADMIN_ACCESS_TOKEN=\$TOKEN[\s\S]*Authorization: Bearer \$\{VERIFY_ADMIN_ACCESS_TOKEN\})/,
);

// Lovable deep-scan security regression guards.
// These lock down the exact vulnerability classes that were remediated in September 2026.
requireText(
  'Data migration imports use explicit field allowlists',
  dataMigration,
  'pickAllowed(candidate, table.allowedColumns)',
);
forbidText(
  'Data migration cannot spread arbitrary imported rows into service-role writes',
  dataMigration,
  'const next = { ...row }',
);

requireText('Device token conflicts fail closed', pushTokenRegister, 'token_conflict');
forbidText(
  'Device token registration cannot service-role upsert on caller token',
  pushTokenRegister,
  '.upsert(',
);
requireText('Web push endpoint conflicts fail closed', pushSubscribe, 'endpoint_conflict');
forbidText(
  'Web push registration cannot service-role upsert on caller endpoint',
  pushSubscribe,
  '.upsert(',
);

requireText('Partner check-ins require accepted partnership', accessControlMigration, "a.status = 'accepted'");
requireText('Partner check-ins require non-ended partnership', accessControlMigration, 'a.ended_at IS NULL');

// Keep the scanner signatures themselves out of repository string literals:
 // this regression guard reconstructs the retired identifiers at runtime.
const retiredMfaGenerator = ['generate', 'mfa', 'backup', 'codes'].join('_');
const retiredMfaConsumer = ['consume', 'mfa', 'backup', 'code'].join('_');
const retiredWeakTokenPattern = ['md5(', 'random()', ''].join('');
forbidText('Legacy custom MFA generator stays removed', legacyMfaMigration, retiredMfaGenerator);
forbidText('Legacy custom MFA consumer stays removed', legacyMfaMigration, retiredMfaConsumer);
forbidText('Predictable legacy token generator stays absent', legacyMfaMigration, retiredWeakTokenPattern);

requireText('Notification dispatcher requires private internal secret', notificationDispatcher, 'x-internal-secret');
requireText('Notification dispatcher compares secret in constant time', notificationDispatcher, 'constantTimeEqual');
requireText('Notification dispatcher reads server-only Vault secret', notificationDispatcher, 'get_notification_dispatcher_secret');
requireRegex(
  'Notification dispatcher stays JWT-gateway protected',
  supabaseConfig,
  /\[functions\.notification-dispatcher\]\s*\nverify_jwt\s*=\s*true/,
);

forbidText(
  'Client Play verifier cannot use service role',
  playVerify,
  'SUPABASE_SERVICE_ROLE_KEY',
);
forbidText(
  'Client Play verifier cannot write Premium profiles',
  playVerify,
  '.from("profiles").update',
);
forbidText(
  'Client Play verifier cannot persist subscription state',
  playVerify,
  '.from("subscriptions")',
);
requireText('Play RTDN marks provider-owned source', playRtdn, 'source: "google_play_rtdn"');
requireText('Play RTDN marks Google verification authority', playRtdn, 'verification_authority: "google_play_api"');
requireText('Premium trigger requires RTDN source', playEntitlementMigration, "metadata->>'source', '') = 'google_play_rtdn'");
requireText('Premium trigger requires Google verification authority', playEntitlementMigration, "metadata->>'verification_authority', '') = 'google_play_api'");

forbidText('Banking API cannot return database error messages', bankingSave, 'error: rpcErr.message');
forbidText('Banking API cannot return raw caught exceptions', bankingSave, 'error: (e as Error).message');
forbidText('Migration API cannot return raw error detail', dataMigration, 'detail: String((e as Error)?.message');
forbidText('Push subscription API cannot return raw caught exceptions', pushSubscribe, 'e instanceof Error ? e.message');
forbidText('Device token API cannot return raw caught exceptions', pushTokenRegister, 'e instanceof Error ? e.message');

requireText('Signup checks breached passwords', authContext, 'assertPasswordIsNotCompromised(password)');
requireText('Password reset checks breached passwords', resetPassword, 'assertPasswordIsNotCompromised(password)');
requireText('Password change checks breached passwords', privacySettings, 'assertPasswordIsNotCompromised');
requireText('Client breached-password lookup uses the HIBP range proxy', pwnedPassword, "functions.invoke('pwned-password-range'");
requireText('Breached-password range proxy uses HIBP range API', pwnedPasswordRange, 'api.pwnedpasswords.com/range/');

// Floating tool versions are not a hard failure yet, but surface them loudly.
for (const [name, content] of [
  ['android-build.yml', androidBuild],
  ['android-play-release.yml', playRelease],
  ['e2e.yml', e2eWorkflow],
]) {
  if (/bun-version:\s*latest/.test(content)) {
    warnings.push(`${name}: Bun is still floating on latest; pin after the next known-good green build.`);
  }
}

console.log(`\nCI regression guard: ${passed.length} protected invariants passed.`);
if (warnings.length) {
  console.log('\nWarnings:');
  for (const warning of warnings) console.log(`  - ${warning}`);
}

if (errors.length) {
  console.error(`\nCI REGRESSION GUARD FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error('\nA previously fixed CI/build failure class has been reintroduced. Fix the regression before trusting Android/Play output.');
  process.exit(1);
}

console.log('\n✔ Known Android, Play, Playwright, AdMob, Firebase, OAuth, signing and security-verifier regressions are blocked.');
