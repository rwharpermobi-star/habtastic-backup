import fs from 'node:fs';
import path from 'node:path';

/**
 * Single source of truth for the Supabase connection + test credentials used
 * by the e2e suite.
 *
 * The project-root `.env` holds the *publishable* Supabase URL + anon key
 * (safe to commit — RLS protects the data), written by the Supabase
 * connection. CI secrets have drifted to old/deleted projects before and
 * produced `getaddrinfo ENOTFOUND ***.supabase.co`, so `.env` wins and
 * environment variables are only a fallback.
 *
 * Accepted variable names (first non-empty wins):
 *   URL:   VITE_SUPABASE_URL, SUPABASE_URL
 *   KEY:   VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY
 *   EMAIL: E2E_EMAIL, TEST_USER_EMAIL
 *   PASS:  E2E_PASSWORD, TEST_USER_PASSWORD
 *
 * Never put secret/service-role keys here.
 */

/** The only Supabase project this app is allowed to talk to. */
export const EXPECTED_SUPABASE_REF = 'votldorvfuktonwewuhm';
export const EXPECTED_SUPABASE_URL = `https://${EXPECTED_SUPABASE_REF}.supabase.co`;

function parseDotEnv(file: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const dotEnv = parseDotEnv(path.resolve(process.cwd(), '.env'));

const pick = (names: string[]) => {
  for (const name of names) {
    const fromFile = dotEnv[name];
    if (fromFile) return fromFile;
  }
  for (const name of names) {
    const fromEnv = process.env[name];
    if (fromEnv) return fromEnv;
  }
  return '';
};

const resolvedUrl = pick(['VITE_SUPABASE_URL', 'SUPABASE_URL']).replace(/\/$/, '');

/**
 * Ignore any URL that points at a different (often deleted) project — the
 * committed `.env` and this constant must agree.
 */
export const SUPABASE_URL =
  resolvedUrl && resolvedUrl !== EXPECTED_SUPABASE_URL ? EXPECTED_SUPABASE_URL : resolvedUrl || EXPECTED_SUPABASE_URL;

export const SUPABASE_MISMATCH = Boolean(resolvedUrl) && resolvedUrl !== EXPECTED_SUPABASE_URL;

export const SUPABASE_ANON_KEY = pick([
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
]);

export const TEST_EMAIL = pick(['E2E_EMAIL', 'TEST_USER_EMAIL']);
export const TEST_PASSWORD = pick(['E2E_PASSWORD', 'TEST_USER_PASSWORD']);

/** localStorage key the Supabase JS client uses for this project. */
export const SUPABASE_STORAGE_KEY = `sb-${EXPECTED_SUPABASE_REF}-auth-token`;

/**
 * Presence-only diagnostics. Never logs a credential value — only booleans and
 * the Supabase hostname (public information).
 */
export function authDiagnostics() {
  return {
    E2E_EMAIL: Boolean(TEST_EMAIL),
    E2E_PASSWORD: Boolean(TEST_PASSWORD),
    VITE_SUPABASE_URL: Boolean(SUPABASE_URL),
    VITE_SUPABASE_PUBLISHABLE_KEY: Boolean(SUPABASE_ANON_KEY),
    supabaseHost: SUPABASE_URL ? new URL(SUPABASE_URL).host : 'unresolved',
    supabaseUrlOverriddenToExpected: SUPABASE_MISMATCH,
  };
}

export function logAuthDiagnostics(label = '[e2e auth]') {
  console.log(`${label} environment diagnostics:`, authDiagnostics());
  if (SUPABASE_MISMATCH) {
    console.warn(
      `${label} A stale VITE_SUPABASE_URL was supplied and ignored; using ${EXPECTED_SUPABASE_URL}.`,
    );
  }
}

/**
 * Fail loudly instead of letting Playwright emit a DNS error for a masked host.
 */
export function assertSupabaseTestEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing Supabase test environment variables — set VITE_SUPABASE_URL (or SUPABASE_URL) ' +
        'and VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY), or restore the project-root .env. ' +
        `Diagnostics: ${JSON.stringify(authDiagnostics())}`,
    );
  }
  if (SUPABASE_URL !== EXPECTED_SUPABASE_URL) {
    throw new Error(
      `Supabase URL must be ${EXPECTED_SUPABASE_URL} — resolved host: ${new URL(SUPABASE_URL).host}`,
    );
  }
  return { SUPABASE_URL, SUPABASE_ANON_KEY };
}

/** Credentials required by the authenticated suite. */
export function assertTestCredentials() {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'Missing e2e login credentials — set E2E_EMAIL / E2E_PASSWORD (or TEST_USER_EMAIL / ' +
        `TEST_USER_PASSWORD). Diagnostics: ${JSON.stringify(authDiagnostics())}`,
    );
  }
  return { TEST_EMAIL, TEST_PASSWORD };
}
