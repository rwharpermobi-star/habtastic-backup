#!/usr/bin/env node
/**
 * Guarantees the Google Services Gradle plugin is *really* applied to the
 * generated Capacitor `:app` module (not just present on the root buildscript
 * classpath, and not hidden behind a comment or a swallowed try/catch).
 *
 * Why this exists: the Capacitor Android template applies the plugin like this
 *
 *   try {
 *       def servicesJSON = file('google-services.json')
 *       if (servicesJSON.text) { apply plugin: 'com.google.gms.google-services' }
 *   } catch(Exception e) { logger.info(...) }
 *
 * Any failure (missing classpath, unreadable file, plugin resolution error) is
 * swallowed, so the build "succeeds" while generating no Firebase resources —
 * FirebaseApp never initialises and no FCM token is ever produced. Naive
 * `grep 'com.google.gms.google-services'` checks also match commented-out or
 * try/catch-guarded lines, which is how CI concluded the plugin was wired when
 * it was not.
 *
 * This script makes the wiring unconditional and loud.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PLUGIN_VERSION = '4.4.4';
const PLUGIN_ID = 'com.google.gms.google-services';
const CLASSPATH_COORD = 'com.google.gms:google-services';
const CRASHLYTICS_PLUGIN_VERSION = '3.0.8';
const CRASHLYTICS_PLUGIN_ID = 'com.google.firebase.crashlytics';
const CRASHLYTICS_CLASSPATH_COORD = 'com.google.firebase:firebase-crashlytics-gradle';

const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const pick = (candidates) => candidates.find((f) => existsSync(f));

const rootGradle = pick(['android/build.gradle', 'android/build.gradle.kts']);
const appGradle = pick(['android/app/build.gradle', 'android/app/build.gradle.kts']);

if (!rootGradle) fail('Missing android/build.gradle(.kts) — did "cap add android" succeed?');
if (!appGradle) fail('Missing android/app/build.gradle(.kts).');
if (!existsSync('android/app/google-services.json')) {
  fail('Missing android/app/google-services.json — Firebase resources cannot be generated.');
}

const kotlinRoot = rootGradle.endsWith('.kts');
const kotlinApp = appGradle.endsWith('.kts');

/** Strip line + block comments so detection never matches disabled code. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

// ── Root build.gradle: classpath must be active, not commented out ───────────
let root = readFileSync(rootGradle, 'utf8');
if (stripComments(root).includes(CLASSPATH_COORD)) {
  console.log(`✔ ${CLASSPATH_COORD} classpath already active in ${rootGradle}`);
} else {
  // Un-comment an existing (disabled) classpath line if there is one.
  const commented = new RegExp(`^([ \\t]*)//+[ \\t]*(classpath[^\\n]*${CLASSPATH_COORD}[^\\n]*)$`, 'm');
  if (commented.test(root)) {
    root = root.replace(commented, '$1$2');
    console.log(`✔ Re-enabled commented-out ${CLASSPATH_COORD} classpath in ${rootGradle}`);
  } else {
    const line = kotlinRoot
      ? `        classpath("${CLASSPATH_COORD}:${PLUGIN_VERSION}")`
      : `        classpath '${CLASSPATH_COORD}:${PLUGIN_VERSION}'`;
    const buildscriptDeps = /(buildscript\s*\{[\s\S]*?dependencies\s*\{)/;
    if (buildscriptDeps.test(root)) {
      root = root.replace(buildscriptDeps, `$1\n${line}`);
    } else {
      root += `\nbuildscript {\n    repositories {\n        google()\n        mavenCentral()\n    }\n    dependencies {\n${line}\n    }\n}\n`;
    }
    console.log(`✔ Added ${CLASSPATH_COORD}:${PLUGIN_VERSION} classpath to ${rootGradle}`);
  }
  writeFileSync(rootGradle, root);
}


// Crashlytics needs its own Gradle plugin classpath. The Google Services
// normalizer must not remove Crashlytics from release builds.
if (stripComments(root).includes(CRASHLYTICS_CLASSPATH_COORD)) {
  console.log('✔ ' + CRASHLYTICS_CLASSPATH_COORD + ' classpath already active in ' + rootGradle);
} else {
  const line = kotlinRoot
    ? '        classpath("' + CRASHLYTICS_CLASSPATH_COORD + ':' + CRASHLYTICS_PLUGIN_VERSION + '")'
    : "        classpath '" + CRASHLYTICS_CLASSPATH_COORD + ':' + CRASHLYTICS_PLUGIN_VERSION + "'";
  const buildscriptDeps = /(buildscript\s*\{[\s\S]*?dependencies\s*\{)/;
  if (buildscriptDeps.test(root)) {
    root = root.replace(buildscriptDeps, '$1\n' + line);
  } else {
    root += '\nbuildscript {\n    repositories {\n        google()\n        mavenCentral()\n    }\n    dependencies {\n' + line + '\n    }\n}\n';
  }
  writeFileSync(rootGradle, root);
  console.log('✔ Added ' + CRASHLYTICS_CLASSPATH_COORD + ':' + CRASHLYTICS_PLUGIN_VERSION + ' classpath to ' + rootGradle);
}

// ── App build.gradle: apply the plugin unconditionally ──────────────────────
let app = readFileSync(appGradle, 'utf8');
const before = app;

// Drop the template's try/catch wrapper that silently swallows failures.
app = app.replace(
  /try\s*\{[^{}]*def\s+servicesJSON[\s\S]*?catch\s*\(\s*Exception[^)]*\)\s*\{[\s\S]*?\}\s*/g,
  '',
);

const applyLine = kotlinApp
  ? `apply(plugin = "${PLUGIN_ID}")`
  : `apply plugin: '${PLUGIN_ID}'`;

const activeApply = new RegExp(
  `^[ \\t]*(apply\\s+plugin:\\s*['"]${PLUGIN_ID}['"]|apply\\(plugin\\s*=\\s*"${PLUGIN_ID}"\\)|id\\(?\\s*['"]${PLUGIN_ID}['"])`,
  'm',
);

if (activeApply.test(stripComments(app))) {
  console.log(`✔ ${PLUGIN_ID} already applied unconditionally in ${appGradle}`);
} else {
  app += `\n// Applied unconditionally by scripts/ensure-google-services-plugin.mjs:\n// a swallowed failure here must break the build, not silently skip Firebase.\n${applyLine}\n`;
  console.log(`✔ Applied ${PLUGIN_ID} in ${appGradle}`);
}


const crashlyticsApplyLine = kotlinApp
  ? 'apply(plugin = "' + CRASHLYTICS_PLUGIN_ID + '")'
  : "apply plugin: '" + CRASHLYTICS_PLUGIN_ID + "'";

const crashlyticsActiveApply = /^\s*apply\s+plugin:\s*['"]com\.google\.firebase\.crashlytics['"]/m;

if (crashlyticsActiveApply.test(stripComments(app))) {
  console.log('✔ ' + CRASHLYTICS_PLUGIN_ID + ' already applied unconditionally in ' + appGradle);
} else {
  app += '\n// Applied unconditionally by scripts/ensure-google-services-plugin.mjs:\n' + crashlyticsApplyLine + '\n';
  console.log('✔ Applied ' + CRASHLYTICS_PLUGIN_ID + ' in ' + appGradle);
}

if (app !== before) writeFileSync(appGradle, app);

const finalApp = stripComments(readFileSync(appGradle, 'utf8'));
if (!activeApply.test(finalApp)) {
  fail(`${PLUGIN_ID} is still not applied in ${appGradle}.`);
}
if (!crashlyticsActiveApply.test(finalApp)) {
  fail(`${CRASHLYTICS_PLUGIN_ID} is still not applied in ${appGradle}.`);
}
const finalRoot = stripComments(readFileSync(rootGradle, 'utf8'));
if (!finalRoot.includes(CRASHLYTICS_CLASSPATH_COORD)) {
  fail(`${CRASHLYTICS_CLASSPATH_COORD} classpath is still missing from ${rootGradle}.`);
}

console.log('✔ Google Services + Crashlytics Gradle wiring verified');
