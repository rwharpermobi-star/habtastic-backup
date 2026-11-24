#!/usr/bin/env node
/**
 * Applies the Android versionCode / versionName AFTER `npx cap sync android`,
 * so Capacitor cannot overwrite them.
 *
 * Versioning strategy (monotonic, never moves backwards):
 *   effective versionCode = max(requested versionCode + optional offset, MIN_VERSION_CODE)
 *   effective versionName = requested versionName, or `1.0.<effectiveVersionCode>`
 *
 * MIN_VERSION_CODE is the floor guard: Google Play already has versionCode 200790 (1.0.8),
 * so every new build must be at least 200791 even if the GitHub run number is lower.
 *
 * The *requested* code/name come from ANDROID_REQUESTED_VERSION_CODE /
 * ANDROID_REQUESTED_VERSION_NAME (with legacy ANDROID_VERSION_CODE /
 * ANDROID_VERSION_NAME and GITHUB_RUN_NUMBER fallbacks). The *effective* values
 * are exported as ANDROID_VERSION_CODE / ANDROID_VERSION_NAME through GITHUB_ENV
 * and GITHUB_OUTPUT, and written to android/version.json so later steps compare
 * against what Gradle actually used instead of a stale run-number value.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const buildGradlePath = 'android/app/build.gradle';
const versionJsonPath = 'android/version.json';

/** Highest versionCode already published on Google Play. */
const PUBLISHED_VERSION_CODE = 200790;
const MIN_VERSION_CODE = PUBLISHED_VERSION_CODE + 1;
const MAX_VERSION_CODE = 2_100_000_000;

const rawVersionCode = (
  process.env.ANDROID_REQUESTED_VERSION_CODE ||
  process.env.ANDROID_VERSION_CODE ||
  process.env.GITHUB_RUN_NUMBER ||
  ''
).trim();

if (!/^[1-9]\d*$/.test(rawVersionCode)) {
  console.error(
    '::error::ANDROID_REQUESTED_VERSION_CODE (or ANDROID_VERSION_CODE / GITHUB_RUN_NUMBER) must be a positive integer.',
  );
  process.exit(1);
}

const rawOffset = (process.env.ANDROID_VERSION_CODE_OFFSET || '0').trim();
if (!/^\d+$/.test(rawOffset)) {
  console.error('::error::ANDROID_VERSION_CODE_OFFSET must be a non-negative integer.');
  process.exit(1);
}
const versionCodeOffset = Number(rawOffset);
const versionCode = Math.max(Number(rawVersionCode) + versionCodeOffset, MIN_VERSION_CODE);
if (!Number.isSafeInteger(versionCode) || versionCode > MAX_VERSION_CODE) {
  console.error(`::error::Effective Android versionCode must be <= ${MAX_VERSION_CODE}.`);
  process.exit(1);
}
const requestedVersionName = (
  process.env.ANDROID_REQUESTED_VERSION_NAME ||
  process.env.ANDROID_VERSION_NAME ||
  ''
).trim();
const versionName = requestedVersionName || `1.0.${versionCode}`;

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName)) {
  console.error('::error::ANDROID_VERSION_NAME must be a semantic version such as 1.0.166.');
  process.exit(1);
}

if (versionCode <= PUBLISHED_VERSION_CODE) {
  console.error(
    `::error::versionCode ${versionCode} is not greater than the published Play versionCode ${PUBLISHED_VERSION_CODE}.`,
  );
  process.exit(1);
}

let buildGradle = readFileSync(buildGradlePath, 'utf8');
const defaultConfigPattern = /defaultConfig\s*\{[\s\S]*?\n\s*\}/;
const defaultConfigMatch = buildGradle.match(defaultConfigPattern);

if (!defaultConfigMatch) {
  console.error(`::error::Could not find defaultConfig in ${buildGradlePath}.`);
  process.exit(1);
}

let defaultConfig = defaultConfigMatch[0];
const versionCodeLine = `        versionCode Integer.parseInt(System.getenv("ANDROID_VERSION_CODE") ?: "${versionCode}")`;
const versionNameLine = `        versionName System.getenv("ANDROID_VERSION_NAME") ?: "${versionName}"`;

if (/^\s*versionCode\b.*$/m.test(defaultConfig)) {
  defaultConfig = defaultConfig.replace(/^\s*versionCode\b.*$/m, versionCodeLine);
} else {
  defaultConfig = defaultConfig.replace(/(defaultConfig\s*\{)/, `$1\n${versionCodeLine}`);
}

if (/^\s*versionName\b.*$/m.test(defaultConfig)) {
  defaultConfig = defaultConfig.replace(/^\s*versionName\b.*$/m, versionNameLine);
} else {
  defaultConfig = defaultConfig.replace(/(defaultConfig\s*\{)/, `$1\n${versionNameLine}`);
}

buildGradle = buildGradle.replace(defaultConfigPattern, defaultConfig);
writeFileSync(buildGradlePath, buildGradle);

// Authoritative record of the EFFECTIVE version for later workflow steps.
// A file is used in addition to GITHUB_ENV because job-level `env:` entries
// take precedence over GITHUB_ENV, which previously left the verifier comparing
// against the raw run number instead of the floored value.
writeFileSync(
  versionJsonPath,
  `${JSON.stringify({ versionCode, versionName, requestedVersionCode: Number(rawVersionCode), versionCodeOffset, minVersionCode: MIN_VERSION_CODE }, null, 2)}\n`,
);

if (process.env.GITHUB_ENV) {
  appendFileSync(
    process.env.GITHUB_ENV,
    `ANDROID_VERSION_CODE=${versionCode}\nANDROID_VERSION_NAME=${versionName}\n`,
  );
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version_code=${versionCode}\nversion_name=${versionName}\n`,
  );
}

console.log(
  `Android version configured after Capacitor sync: versionName=${versionName}, versionCode=${versionCode} (requested ${rawVersionCode}, offset ${versionCodeOffset}, floor ${MIN_VERSION_CODE})`,
);
