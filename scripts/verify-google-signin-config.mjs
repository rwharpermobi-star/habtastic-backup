#!/usr/bin/env node
/**
 * Verifies that the Android release signing certificate is registered for
 * Google Sign-In, and that google-services.json matches this app.
 *
 * Usage: node scripts/verify-google-signin-config.mjs <google-services.json> <sha1> <sha256>
 *
 * Native Google Sign-In (the ID-token flow used by src/lib/nativeGoogleAuth.ts)
 * only works when the release SHA-1 is registered on the Firebase Android app,
 * because that is what creates the client_type 1 OAuth client. A missing
 * fingerprint is a warning, not a failure: the app falls back to the
 * browser-based flow. A wrong package name or missing Web client is fatal.
 */
import { readFileSync } from 'node:fs';

const EXPECTED_PACKAGE = 'app.lovable.habtastic';
const [configPath, rawSha1 = '', rawSha256 = ''] = process.argv.slice(2);

if (!configPath) {
  console.error('::error::Usage: verify-google-signin-config.mjs <google-services.json> <sha1> <sha256>');
  process.exit(1);
}

const normalize = (value) => value.replace(/:/g, '').trim().toLowerCase();
const sha1 = normalize(rawSha1);
const sha256 = normalize(rawSha256);

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const client = config.client?.find(
  (entry) => entry.client_info?.android_client_info?.package_name === EXPECTED_PACKAGE,
);

if (!client) {
  console.error(`::error::${configPath} has no client for package ${EXPECTED_PACKAGE}`);
  process.exit(1);
}
console.log(`✔ google-services.json package matches ${EXPECTED_PACKAGE}`);

const oauthClients = client.oauth_client ?? [];
const webClients = oauthClients.filter((entry) => entry.client_type === 3);
if (webClients.length === 0) {
  console.error('::error::No Web OAuth client (client_type 3) found; Supabase cannot verify Google ID tokens.');
  process.exit(1);
}
console.log(`✔ Web OAuth client present: ${webClients[0].client_id}`);

const androidClients = oauthClients.filter((entry) => entry.client_type === 1);
const registered = androidClients
  .map((entry) => normalize(entry.android_info?.certificate_hash ?? ''))
  .filter(Boolean);

if (registered.length === 0) {
  console.log('::warning::No Android OAuth client (client_type 1) in google-services.json.');
  console.log(`::warning::Add SHA-1 ${sha1 || '<unknown>'} and SHA-256 ${sha256 || '<unknown>'} to the Firebase Android app`);
  console.log('::warning::(Firebase console > Project settings > Your apps > Add fingerprint), then re-download google-services.json.');
  console.log('::warning::Until then the APK falls back to the browser-based Google sign-in flow.');
} else if (sha1 && registered.includes(sha1)) {
  console.log(`✔ Release SHA-1 ${sha1} is registered as an Android OAuth client`);
} else {
  console.log(`::warning::Release SHA-1 ${sha1 || '<unknown>'} is not among registered fingerprints: ${registered.join(', ')}`);
  console.log('::warning::Native Google Sign-In will report DEVELOPER_ERROR and fall back to the browser flow.');
}
