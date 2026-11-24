#!/usr/bin/env node
/**
 * Build-time guard for production Android releases.
 *
 * Fails when:
 *  - VITE_ADMOB_LIVE is not exactly "true"
 *  - any production ad unit ID (app/interstitial/rewarded) is missing
 *  - any Google TEST ad unit ID leaked into the built production bundle
 *
 * Sources checked (in order): process env, then .env.production.
 * Never prints secrets — only ad unit IDs, which are public by design.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXPECTED = {
  VITE_ADMOB_APP_ID: 'ca-app-pub-1971238777773206~4099124115',
  VITE_ADMOB_INTERSTITIAL_ID: 'ca-app-pub-1971238777773206/4450477901',
  VITE_ADMOB_REWARDED_ID: 'ca-app-pub-1971238777773206/5222407599',
};

// Google's official test units — must never appear in a production bundle.
const TEST_IDS = [
  'ca-app-pub-3940256099942544~3347511713',
  'ca-app-pub-3940256099942544/6300978111',
  'ca-app-pub-3940256099942544/1033173712',
  'ca-app-pub-3940256099942544/5224354917',
];

const envFile = existsSync('.env.production') ? readFileSync('.env.production', 'utf8') : '';
const fromFile = (key) => {
  const m = envFile.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n\\r]*)"?`, 'm'));
  return m ? m[1].trim() : '';
};
const value = (key) => (process.env[key] ?? '').trim() || fromFile(key);

const errors = [];

if (value('VITE_ADMOB_LIVE') !== 'true') {
  errors.push('VITE_ADMOB_LIVE must be "true" for production Android releases.');
}

for (const [key, expected] of Object.entries(EXPECTED)) {
  const actual = value(key);
  if (!actual) errors.push(`${key} is missing.`);
  else if (actual !== expected) errors.push(`${key} mismatch — expected ${expected}, got ${actual}`);
  else console.log(`✔ ${key} = ${expected}`);
}

// Scan the built bundle (when present) for leaked test IDs.
const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|css|html)$/.test(entry)) out.push(p);
  }
  return out;
};

if (existsSync('dist')) {
  const files = walk('dist');
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const id of TEST_IDS) {
      if (src.includes(id)) errors.push(`Google TEST ad unit ${id} found in production bundle: ${file}`);
    }
  }
  const bundleHasLiveRewarded = files.some((f) =>
    readFileSync(f, 'utf8').includes(EXPECTED.VITE_ADMOB_REWARDED_ID),
  );
  if (!bundleHasLiveRewarded) {
    errors.push('Production rewarded ad unit ID not found in the built bundle — env vars were not applied to `bun run build`.');
  }
  console.log(`✔ Scanned ${files.length} bundle files in dist/`);
} else {
  console.log('ℹ dist/ not present — bundle scan skipped (run after `bun run build`).');
}

if (errors.length) {
  console.error('\nAdMob production verification FAILED:');
  for (const e of errors) console.error(`  ✖ ${e}`);
  process.exit(1);
}

console.log('\n✔ Production AdMob configuration verified (interstitial, rewarded).');
