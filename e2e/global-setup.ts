import type { FullConfig } from '@playwright/test';
import {
  assertSupabaseTestEnv,
  assertTestCredentials,
  logAuthDiagnostics,
} from './env';

/**
 * Runs once before any browser is launched. Missing credentials / Supabase
 * config used to surface as an opaque browser or DNS error deep inside
 * `auth.setup.ts`; now the suite fails immediately with presence-only
 * diagnostics (booleans + the public Supabase hostname — never a value).
 */
export default function globalSetup(config: FullConfig) {
  logAuthDiagnostics('[e2e preflight]');
  assertSupabaseTestEnv();
  const authenticatedProjects = new Set(['setup', 'chromium', 'audio-web', 'audio-android']);
  if (config.projects.some((project) => authenticatedProjects.has(project.name))) {
    assertTestCredentials();
  }
  console.log('[e2e preflight] environment OK — launching browsers');
}
