#!/usr/bin/env node
/**
 * Verifies that the *built* APK and AAB carry exactly the effective Android
 * version that Gradle used, and that the Play floor guard holds.
 *
 * Expected values come from android/version.json (written by
 * scripts/configure-android-version.mjs AFTER the floor logic is applied) and
 * are cross-checked against the literals in android/app/build.gradle — never
 * from a raw GitHub run number, which can be lower than the floor.
 *
 * Tool strategy (robust on ubuntu-latest, no guessed paths):
 *   APK -> apkanalyzer (cmdline-tools / tools/bin / PATH), else aapt2/aapt badging
 *   AAB -> bundletool jar found locally, else deterministically downloaded (pinned)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PUBLISHED_VERSION_CODE = 200790;
const BUNDLETOOL_VERSION = '1.17.0';
const BUNDLETOOL_URL = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`;

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

/** Strip quotes/whitespace and keep the last meaningful token of a tool's output. */
const normalize = (raw) => {
  const line = String(raw)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(WARNING|Note|Picked up)/i.test(l))
    .pop();
  if (!line) return '';
  const token = line.split(/\s+/).pop();
  return token.replace(/^['"]|['"]$/g, '').replace(/[\r\u0000]/g, '').trim();
};

function walkFind(root, name, depth = 6) {
  if (!root || !existsSync(root)) return null;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory() && depth > 0) {
      const found = walkFind(full, name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function findFirstArtifact(dir, ext) {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => join(dir, f))
    .sort()[0];
  return hit ?? null;
}

// ---------------------------------------------------------------- expectations
if (!existsSync('android/version.json')) {
  fail('android/version.json is missing — run scripts/configure-android-version.mjs first.');
}
const expected = JSON.parse(readFileSync('android/version.json', 'utf8'));
const expectedCode = Number(expected.versionCode);
const expectedName = String(expected.versionName ?? '');

if (!Number.isInteger(expectedCode) || expectedCode <= 0 || !expectedName) {
  fail('android/version.json does not contain a usable versionCode/versionName.');
}

const buildGradle = readFileSync('android/app/build.gradle', 'utf8');
const gradleCode =
  buildGradle.match(
    /versionCode\s+Integer\.parseInt\(System\.getenv\("ANDROID_VERSION_CODE"\)\s*\?:\s*"(\d+)"\)/,
  )?.[1] ?? buildGradle.match(/versionCode\s+(\d+)/)?.[1];
const gradleName =
  buildGradle.match(
    /versionName\s+System\.getenv\("ANDROID_VERSION_NAME"\)\s*\?:\s*"([^"]+)"/,
  )?.[1] ?? buildGradle.match(/versionName\s+"([^"]+)"/)?.[1];

if (gradleCode !== String(expectedCode) || gradleName !== expectedName) {
  fail(
    `build.gradle (${gradleName}/${gradleCode}) disagrees with android/version.json (${expectedName}/${expectedCode}).`,
  );
}
if (expectedCode <= PUBLISHED_VERSION_CODE) {
  fail(
    `Effective versionCode ${expectedCode} is not greater than the published Play versionCode ${PUBLISHED_VERSION_CODE}.`,
  );
}

console.log(`Expected internal version: versionName=${expectedName} versionCode=${expectedCode}`);

// ------------------------------------------------------------------ artifacts
const apk = findFirstArtifact('android/app/build/outputs/apk/release', '.apk');
const aab = findFirstArtifact('android/app/build/outputs/bundle/release', '.aab');
if (!apk) fail('No release APK found under android/app/build/outputs/apk/release.');
if (!aab) fail('No release AAB found under android/app/build/outputs/bundle/release.');

// ----------------------------------------------------------------- apk values
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';

function onPath(bin) {
  try {
    return run('bash', ['-lc', `command -v ${bin} || true`]).trim() || null;
  } catch {
    return null;
  }
}

function readApkVersionsWithApkanalyzer() {
  const candidates = [
    join(sdkRoot, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer'),
    join(sdkRoot, 'tools', 'bin', 'apkanalyzer'),
  ].filter((p) => p && existsSync(p));
  const found =
    candidates[0] ??
    walkFind(join(sdkRoot, 'cmdline-tools'), 'apkanalyzer') ??
    onPath('apkanalyzer');
  if (!found) return null;
  try {
    return {
      tool: found,
      code: normalize(run(found, ['manifest', 'version-code', apk])),
      name: normalize(run(found, ['manifest', 'version-name', apk])),
    };
  } catch (error) {
    console.log(`apkanalyzer failed (${error.message}); falling back to aapt.`);
    return null;
  }
}

function readApkVersionsWithAapt() {
  const buildTools = join(sdkRoot, 'build-tools');
  let tool = null;
  if (existsSync(buildTools)) {
    const versions = readdirSync(buildTools)
      .filter((d) => statSync(join(buildTools, d)).isDirectory())
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const version of versions.reverse()) {
      for (const bin of ['aapt2', 'aapt']) {
        const candidate = join(buildTools, version, bin);
        if (existsSync(candidate)) {
          tool = candidate;
          break;
        }
      }
      if (tool) break;
    }
  }
  tool = tool ?? onPath('aapt2') ?? onPath('aapt');
  if (!tool) return null;
  const badging = run(tool, ['dump', 'badging', apk]);
  return {
    tool,
    code: badging.match(/versionCode='(\d+)'/)?.[1] ?? '',
    name: badging.match(/versionName='([^']*)'/)?.[1] ?? '',
  };
}

const apkVersions = readApkVersionsWithApkanalyzer() ?? readApkVersionsWithAapt();
if (!apkVersions) {
  fail(
    'Neither apkanalyzer nor aapt/aapt2 could be located in the Android SDK — cannot read APK manifest.',
  );
}

// ----------------------------------------------------------------- aab values
function resolveBundletool() {
  const local =
    walkFind(join(process.env.HOME ?? '', '.gradle'), `bundletool-all-${BUNDLETOOL_VERSION}.jar`, 5) ??
    walkFind(join(sdkRoot, 'bundletool'), `bundletool-all-${BUNDLETOOL_VERSION}.jar`, 3);
  if (local) return local;

  const dir = join(process.env.RUNNER_TEMP || tmpdir(), 'bundletool');
  mkdirSync(dir, { recursive: true });
  const jar = join(dir, `bundletool-all-${BUNDLETOOL_VERSION}.jar`);
  if (!existsSync(jar)) {
    console.log(`Downloading bundletool ${BUNDLETOOL_VERSION}…`);
    run('curl', ['-fsSL', '--retry', '3', '--retry-delay', '2', '-o', jar, BUNDLETOOL_URL]);
  }
  if (!existsSync(jar) || statSync(jar).size < 1024) {
    fail('bundletool jar download failed or is empty.');
  }
  return jar;
}

const bundletool = resolveBundletool();
const dumpXpath = (xpath) =>
  normalize(run('java', ['-jar', bundletool, 'dump', 'manifest', '--bundle', aab, '--xpath', xpath]));

const aabCode = dumpXpath('/manifest/@android:versionCode');
const aabName = dumpXpath('/manifest/@android:versionName');

// ------------------------------------------------------------------ compare
console.log(`APK (${apkVersions.tool}): versionName=${apkVersions.name} versionCode=${apkVersions.code}`);
console.log(`AAB (${bundletool}): versionName=${aabName} versionCode=${aabCode}`);

const problems = [];
if (apkVersions.code !== aabCode || apkVersions.name !== aabName) {
  problems.push(
    `APK and AAB disagree: APK=${apkVersions.name}/${apkVersions.code} AAB=${aabName}/${aabCode}.`,
  );
}
if (apkVersions.code !== String(expectedCode)) {
  problems.push(`APK versionCode ${apkVersions.code} !== expected ${expectedCode}.`);
}
if (aabCode !== String(expectedCode)) {
  problems.push(`AAB versionCode ${aabCode} !== expected ${expectedCode}.`);
}
if (apkVersions.name !== expectedName) {
  problems.push(`APK versionName ${apkVersions.name} !== expected ${expectedName}.`);
}
if (aabName !== expectedName) {
  problems.push(`AAB versionName ${aabName} !== expected ${expectedName}.`);
}
if (!/^\d+$/.test(aabCode) || Number(aabCode) <= PUBLISHED_VERSION_CODE) {
  problems.push(
    `AAB versionCode ${aabCode} is not greater than the published Play versionCode ${PUBLISHED_VERSION_CODE}.`,
  );
}

if (problems.length) {
  problems.forEach((p) => console.error(`::error::${p}`));
  process.exit(1);
}

console.log('✔ APK and AAB internal versions verified against the effective Gradle version');
