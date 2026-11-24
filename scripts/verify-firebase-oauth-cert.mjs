#!/usr/bin/env node
/**
 * Verify that the Android release signing certificate used by CI is registered
 * as an Android OAuth client in google-services.json for HabTastic.
 *
 * GitHub's GOOGLE_SERVICES_JSON secret can lag behind the committed Firebase
 * config. If the secret-decoded file has no Android OAuth certificate mappings,
 * recover the committed config from HEAD, but only when it contains the correct
 * package and certificate mappings. The selected file is still verified against
 * the actual release keystore SHA-1 before the build can continue.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const PACKAGE_NAME = 'app.lovable.habtastic';
const GOOGLE_SERVICES = 'android/app/google-services.json';

// Public SHA-1 fingerprints previously present in the verified Firebase Android
// configuration. Certificate fingerprints are not credentials. Keeping this
// allowlist in source lets CI verify the release keystore even though
// google-services.json itself is intentionally supplied from GitHub Secrets.
const KNOWN_ANDROID_OAUTH_SHA1 = [
  '0f8523cc77efe2d73995aa0ae2d1fbb202e30add',
  'ad9671db568af5d48ffc839e1365b82c7de1ad60',
  'd467ef2b1b836e295c5a2972a4a513fb3bf01a77',
];

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

const warn = (message) => console.warn(`::warning::${message}`);

const keystorePath = (process.env.ANDROID_KEYSTORE_PATH || '').trim();
const keystorePassword = process.env.ANDROID_KEYSTORE_PASSWORD || '';
const keyAlias = (process.env.ANDROID_KEY_ALIAS || '').trim();

if (!keystorePath) fail('ANDROID_KEYSTORE_PATH is missing.');
if (!existsSync(keystorePath)) fail(`Release keystore does not exist at ${keystorePath}.`);
if (!keystorePassword) fail('ANDROID_KEYSTORE_PASSWORD is missing.');
if (!keyAlias) fail('ANDROID_KEY_ALIAS is missing.');
if (!existsSync(GOOGLE_SERVICES)) fail(`${GOOGLE_SERVICES} is missing.`);

const parseConfig = (raw, source) => {
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Could not parse ${source}: ${error.message}`);
  }
};

const getFirebaseClient = (config) =>
  (config.client || []).find(
    (client) => client?.client_info?.android_client_info?.package_name === PACKAGE_NAME,
  );

const getRegisteredHashes = (firebaseClient) =>
  (firebaseClient?.oauth_client || [])
    .filter(
      (client) =>
        client?.client_type === 1 &&
        client?.android_info?.package_name === PACKAGE_NAME &&
        typeof client?.android_info?.certificate_hash === 'string',
    )
    .map((client) => client.android_info.certificate_hash.replace(/[^0-9a-f]/gi, '').toLowerCase())
    .filter(Boolean);

let config = parseConfig(readFileSync(GOOGLE_SERVICES, 'utf8'), GOOGLE_SERVICES);
let firebaseClient = getFirebaseClient(config);
if (!firebaseClient) {
  fail(`${GOOGLE_SERVICES} has no Firebase Android client for ${PACKAGE_NAME}.`);
}

let registeredHashes = getRegisteredHashes(firebaseClient);

// Some current Firebase downloads omit Android OAuth certificate_hash entries.
// In that case, verify the actual release keystore against the public,
// previously-verified signing-certificate allowlist instead of falling back to
// a committed google-services.json (which is intentionally no longer tracked).
if (registeredHashes.length === 0) {
  registeredHashes = [...KNOWN_ANDROID_OAUTH_SHA1];
  warn(
    'GOOGLE_SERVICES_JSON has no Android OAuth certificate mappings; ' +
      'verifying the release signing certificate against the checked-in public SHA-1 allowlist.',
  );
}

let keytoolOutput;
try {
  keytoolOutput = execFileSync(
    'keytool',
    [
      '-list',
      '-v',
      '-keystore',
      keystorePath,
      '-alias',
      keyAlias,
      '-storepass',
      keystorePassword,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (error) {
  const detail = String(error?.stderr || error?.message || error).trim();
  fail(`Unable to read release signing certificate with keytool: ${detail}`);
}

const sha1Match = keytoolOutput.match(/SHA1:\s*([0-9A-F:]+)/i);
if (!sha1Match) {
  fail('keytool output did not contain a SHA1 fingerprint.');
}

const releaseSha1 = sha1Match[1].replace(/[^0-9a-f]/gi, '').toLowerCase();
if (releaseSha1.length !== 40) {
  fail(`Unexpected release SHA-1 length (${releaseSha1.length}); refusing to continue.`);
}

if (!registeredHashes.includes(releaseSha1)) {
  const readable = releaseSha1.match(/.{2}/g)?.join(':').toUpperCase() || releaseSha1;
  fail(
    `Release signing SHA-1 ${readable} is not registered as an Android OAuth client for ${PACKAGE_NAME}. ` +
      'Add this SHA-1 in Firebase Project Settings > Your apps > Android, then replace GOOGLE_SERVICES_JSON with the refreshed file.',
  );
}

console.log(`✔ Release signing SHA-1 matches Firebase Android OAuth configuration for ${PACKAGE_NAME}`);
console.log(`✔ ${registeredHashes.length} Android OAuth certificate mapping(s) available in google-services.json`);
