#!/usr/bin/env node
/**
 * CI guard for the Android push notification contract.
 *
 * A mismatch between any of these four places silently breaks background
 * notifications (Android 8+ drops messages whose channel doesn't exist, and a
 * missing/colored small icon renders as a white square), so this fails the
 * build instead of shipping a dead notification path.
 *
 *   1. AndroidManifest.xml  — POST_NOTIFICATIONS + FCM default channel/icon/color meta-data
 *   2. src/hooks/useNativePush.ts — ANDROID_CHANNEL_ID (the channel actually created)
 *   3. supabase/functions/_shared/nativePush.ts — android.notification.channel_id + icon
 *   4. android/app/google-services.json — package mapping for app.lovable.habtastic
 *
 * Run: node scripts/verify-push-config.mjs
 */
import { readFileSync, existsSync } from 'node:fs';

const CHANNEL_ID = 'habtastic_default';
const SMALL_ICON = 'ic_stat_habtastic';
const PACKAGE_ID = 'app.lovable.habtastic';

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const HOOK = 'src/hooks/useNativePush.ts';
const SENDER = 'supabase/functions/_shared/nativePush.ts';
const CAPACITOR_CONFIG = 'capacitor.config.ts';
const LOCAL_NOTIFICATIONS = 'src/lib/habitNotifications.ts';
const DRAWABLE = `android/app/src/main/res/drawable/${SMALL_ICON}.xml`;
const COLORS = 'android/app/src/main/res/values/colors.xml';
const GOOGLE_SERVICES = 'android/app/google-services.json';

const errors = [];
const ok = [];

const read = (p) => {
  if (!existsSync(p)) {
    errors.push(`missing file: ${p}`);
    return '';
  }
  return readFileSync(p, 'utf8');
};

const check = (condition, failure, success) => {
  if (condition) ok.push(success);
  else errors.push(failure);
};

// ── 1. Manifest ────────────────────────────────────────────────────────────
const manifest = read(MANIFEST);
check(
  manifest.includes('android.permission.POST_NOTIFICATIONS'),
  `${MANIFEST}: missing <uses-permission android:name="android.permission.POST_NOTIFICATIONS" /> (Android 13+ never shows notifications without it)`,
  'manifest declares POST_NOTIFICATIONS',
);
check(
  /default_notification_channel_id"\s*\n?\s*android:value="([^"]+)"/.test(manifest) &&
    manifest.match(/default_notification_channel_id"\s*\n?\s*android:value="([^"]+)"/)[1] === CHANNEL_ID,
  `${MANIFEST}: default_notification_channel_id must be "${CHANNEL_ID}"`,
  `manifest default channel = ${CHANNEL_ID}`,
);
check(
  manifest.includes(`default_notification_icon`) && manifest.includes(`@drawable/${SMALL_ICON}`),
  `${MANIFEST}: default_notification_icon must reference @drawable/${SMALL_ICON}`,
  `manifest default icon = @drawable/${SMALL_ICON}`,
);
check(
  !/default_notification_icon[\s\S]{0,120}@mipmap\//.test(manifest),
  `${MANIFEST}: default_notification_icon points at a @mipmap launcher icon — small icons are alpha masks and would render as a white square`,
  'manifest small icon is not a launcher mipmap',
);
check(
  manifest.includes('default_notification_color') && manifest.includes('@color/habtastic_notification'),
  `${MANIFEST}: default_notification_color must reference @color/habtastic_notification`,
  'manifest default notification colour set',
);

// ── 2. Drawable + colour resource ──────────────────────────────────────────
const drawable = read(DRAWABLE);
check(
  drawable.includes('<vector'),
  `${DRAWABLE}: must be a vector drawable`,
  `${SMALL_ICON} exists as a vector drawable`,
);
const fills = [...drawable.matchAll(/android:fillColor="(#[0-9A-Fa-f]{6,8})"/g)].map((m) =>
  m[1].toUpperCase(),
);
check(
  fills.length > 0 && fills.every((c) => c === '#FFFFFFFF' || c === '#FFFFFF'),
  `${DRAWABLE}: every fillColor must be opaque white (found ${fills.join(', ') || 'none'}) — Android repaints the small icon from its alpha mask`,
  'small icon is monochrome white (valid alpha mask)',
);
check(
  read(COLORS).includes('habtastic_notification'),
  `${COLORS}: missing <color name="habtastic_notification">`,
  'notification accent colour defined',
);

// ── 3. Client hook ─────────────────────────────────────────────────────────
const hook = read(HOOK);
check(
  hook.includes(`ANDROID_CHANNEL_ID = '${CHANNEL_ID}'`) ||
    hook.includes(`ANDROID_CHANNEL_ID = "${CHANNEL_ID}"`),
  `${HOOK}: ANDROID_CHANNEL_ID must be "${CHANNEL_ID}"`,
  `client creates channel ${CHANNEL_ID}`,
);
check(
  hook.includes('createChannel'),
  `${HOOK}: no PushNotifications.createChannel call — the channel must exist before FCM targets it`,
  'client creates the notification channel at startup',
);

// ── 4. Server sender ───────────────────────────────────────────────────────
const sender = read(SENDER);
check(
  sender.includes(`channel_id: "${CHANNEL_ID}"`),
  `${SENDER}: android.notification.channel_id must be "${CHANNEL_ID}"`,
  `FCM sender targets channel ${CHANNEL_ID}`,
);
check(
  sender.includes(`icon: "${SMALL_ICON}"`),
  `${SENDER}: android.notification.icon must be "${SMALL_ICON}"`,
  `FCM sender uses icon ${SMALL_ICON}`,
);
check(
  sender.includes('fcm.googleapis.com/v1/projects/'),
  `${SENDER}: must use the FCM HTTP v1 endpoint`,
  'FCM sender uses HTTP v1',
);
check(
  !sender.includes('FLUTTER_NOTIFICATION_CLICK'),
  `${SENDER}: FLUTTER_NOTIFICATION_CLICK is Flutter-specific and has no matching Capacitor intent filter`,
  'FCM tap action uses Capacitor/Android default routing',
);

// ── 5. Local-notification resources ───────────────────────────────────────
const capacitorConfig = read(CAPACITOR_CONFIG);
const localNotifications = read(LOCAL_NOTIFICATIONS);
check(
  capacitorConfig.includes(`smallIcon: '${SMALL_ICON}'`) ||
    capacitorConfig.includes(`smallIcon: "${SMALL_ICON}"`),
  `${CAPACITOR_CONFIG}: LocalNotifications.smallIcon must be "${SMALL_ICON}"`,
  `Capacitor local notifications use ${SMALL_ICON}`,
);
check(
  localNotifications.includes(`smallIcon: '${SMALL_ICON}'`) ||
    localNotifications.includes(`smallIcon: "${SMALL_ICON}"`),
  `${LOCAL_NOTIFICATIONS}: scheduled notifications must use "${SMALL_ICON}"`,
  `scheduled local notifications use ${SMALL_ICON}`,
);
check(
  !capacitorConfig.includes('siren.wav') && !localNotifications.includes('siren.wav'),
  'Local notifications reference siren.wav, but android/app/src/main/res/raw/siren.wav is not bundled',
  'local notifications do not reference an unbundled custom sound',
);

// ── 6. Firebase package mapping ────────────────────────────────────────────
const gsRaw = read(GOOGLE_SERVICES);
if (gsRaw) {
  try {
    const gs = JSON.parse(gsRaw);
    const packages = (gs.client ?? []).map((c) => c?.client_info?.android_client_info?.package_name);
    check(
      packages.includes(PACKAGE_ID),
      `${GOOGLE_SERVICES}: no client entry for package ${PACKAGE_ID} (found: ${packages.join(', ') || 'none'})`,
      `google-services.json maps ${PACKAGE_ID}`,
    );
    check(
      Boolean(gs.project_info?.project_id),
      `${GOOGLE_SERVICES}: project_info.project_id is missing`,
      `firebase project = ${gs.project_info?.project_id}`,
    );
  } catch {
    errors.push(`${GOOGLE_SERVICES}: invalid JSON`);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────
for (const line of ok) console.log(`  ✔ ${line}`);
if (errors.length) {
  console.error('\n✖ Push notification config check FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\n✔ Android push notification config is consistent.');
