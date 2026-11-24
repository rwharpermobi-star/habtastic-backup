#!/usr/bin/env node
/**
 * Verify the public backend settings in a production bundle before shipping it.
 * Use --assets <directory> after Capacitor sync to check the native copy too.
 * Release workflows also use --check-backend to validate the key without a login.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from 'vite';

const EXPECTED_PROJECT = 'votldorvfuktonwewuhm';
const EXPECTED_URL = `https://${EXPECTED_PROJECT}.supabase.co`;
const args = process.argv.slice(2);
let assetsDir = 'dist';
let checkBackend = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--assets' && args[i + 1]) assetsDir = args[++i];
  else if (args[i] === '--check-backend') checkBackend = true;
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}

const env = loadEnv('production', process.cwd(), 'VITE_');
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const errors = [];
if (url !== EXPECTED_URL) errors.push('VITE_SUPABASE_URL must point to the production HabTastic project.');
if (env.VITE_SUPABASE_PROJECT_ID !== EXPECTED_PROJECT) errors.push('VITE_SUPABASE_PROJECT_ID does not match the production backend.');
if (env.VITE_SUPABASE_BACKEND !== 'external') errors.push('Production releases must use the external HabTastic backend.');

if (!key) {
  errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing; native sign-in and direct API requests would fail.');
} else if (key.startsWith('sb_secret_')) {
  errors.push('A server secret key must never be bundled in a client app.');
} else if (!key.startsWith('sb_publishable_')) {
  // Existing CI installations may still supply the public legacy anon JWT.
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    if (payload.role !== 'anon' || payload.ref !== EXPECTED_PROJECT) {
      errors.push('Only a public publishable key or the production anon JWT may be bundled.');
    }
  } catch {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is not a supported public client key.');
  }
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return walk(path);
  return entry.isFile() && /\.(js|mjs)$/.test(entry.name) ? [path] : [];
});
if (!existsSync(assetsDir)) {
  errors.push(`Built assets are missing: ${assetsDir}. Run the production build first.`);
} else {
  const files = walk(assetsDir);
  let foundUrl = false;
  let foundKey = false;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    foundUrl ||= Boolean(url) && source.includes(url);
    foundKey ||= Boolean(key) && source.includes(key);
    if (source.includes('sb_secret_') && /sb_secret_[A-Za-z0-9_-]{10,}/.test(source)) {
      errors.push(`A server secret key was found in built assets: ${file}`);
    }
  }
  if (!files.length) errors.push('No JavaScript assets found in the production bundle.');
  if (!foundUrl) errors.push('The production backend URL was not compiled into the JavaScript assets.');
  if (!foundKey) errors.push('The public backend key was not compiled into the JavaScript assets.');
  console.log(`Checked ${files.length} JavaScript files in ${assetsDir} (key values omitted).`);
}

if (errors.length) {
  console.error('Supabase production verification FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (checkBackend) {
  // The REST OpenAPI root is admin-only. Probe public auth routes with the
  // same client key that a signed-out app uses, without accessing user data.
  for (const endpoint of ['/auth/v1/health', '/auth/v1/settings']) {
    try {
      // Modern publishable keys belong in apikey, not the JWT bearer header.
      const response = await fetch(`${url}${endpoint}`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(15_000),
      });
      const responseBody = await response.text();
      if (!response.ok) {
        const detail = responseBody ? responseBody.slice(0, 1200) : 'No response body returned.';
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      console.log(`Production backend ${endpoint}: HTTP ${response.status}`);
    } catch (error) {
      console.error(`Production backend check failed for ${endpoint}: ${error.message}`);
      process.exit(1);
    }
  }
}
console.log('Production Supabase URL and public client key verified.');
