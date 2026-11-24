/**
 * Environment-based Supabase backend switcher.
 *
 * The primary browser/mobile backend is the active HabTastic Supabase project.
 * An optional second target (a future Lovable Cloud project) can be supplied
 * through VITE_SUPABASE_CLOUD_URL, VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY and
 * VITE_SUPABASE_CLOUD_PROJECT_ID.
 *
 * Selection is resolved once at module load from:
 *   1. localStorage override written by the admin switcher UI
 *   2. VITE_SUPABASE_BACKEND ("external" | "cloud")
 *   3. "external"
 */

export type BackendId = 'external' | 'cloud';

export interface BackendTarget {
  id: BackendId;
  label: string;
  url: string;
  publishableKey: string;
  projectId: string;
  available: boolean;
}

const STORAGE_KEY = 'habtastic.supabase.backend';
const env = import.meta.env as Record<string, string | undefined>;

// Active HabTastic Supabase project. These are public client connection values,
// not service-role credentials. Environment variables still take precedence.
const PRODUCTION_SUPABASE_URL = 'https://votldorvfuktonwewuhm.supabase.co';
// Public publishable (browser) key for the same project. Used only when a build
// environment does not inject VITE_SUPABASE_PUBLISHABLE_KEY (e.g. hosted preview
// builds), so the app never boots into a blank screen with "supabaseKey is
// required". This is NOT a secret — it is shipped in every client bundle anyway.
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_d4IwyvgV6bmjMTecXdOtGA_F7flf7mD';
const PRODUCTION_SUPABASE_PROJECT_ID = 'votldorvfuktonwewuhm';

function target(
  id: BackendId,
  label: string,
  url?: string,
  publishableKey?: string,
  projectId?: string,
): BackendTarget {
  return {
    id,
    label,
    url: url ?? '',
    publishableKey: publishableKey ?? '',
    projectId: projectId ?? '',
    available: Boolean(url && publishableKey),
  };
}

export const BACKEND_TARGETS: Record<BackendId, BackendTarget> = {
  external: target(
    'external',
    'External Supabase (production)',
    env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY || PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_PROJECT_ID || PRODUCTION_SUPABASE_PROJECT_ID,
  ),
  cloud: target(
    'cloud',
    'Lovable Cloud Supabase',
    env.VITE_SUPABASE_CLOUD_URL,
    env.VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY,
    env.VITE_SUPABASE_CLOUD_PROJECT_ID,
  ),
};

function readStoredBackend(): BackendId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'external' || raw === 'cloud' ? raw : null;
  } catch {
    return null;
  }
}

function resolveBackendId(): BackendId {
  const requested =
    readStoredBackend() ??
    (env.VITE_SUPABASE_BACKEND === 'cloud' ? 'cloud' : 'external');

  if (BACKEND_TARGETS[requested].available) return requested;

  if (requested !== 'external') {
    console.warn(
      `[supabase] backend "${requested}" is not configured in this build — falling back to "external".`,
    );
  }
  return 'external';
}

/** Backend selected for this session — stable for the lifetime of the page. */
export const activeBackendId: BackendId = resolveBackendId();

/** Connection details the Supabase client is built from. */
export const activeBackend: BackendTarget = BACKEND_TARGETS[activeBackendId];

/** Return available backends for the admin switcher UI. */
export function listBackends(): BackendTarget[] {
  return [BACKEND_TARGETS.external, BACKEND_TARGETS.cloud];
}

/**
 * Persist a backend choice. The Supabase client and every cached session are
 * bound to a single project, so the caller must reload the app afterwards.
 */
export function setPreferredBackend(id: BackendId): void {
  if (!BACKEND_TARGETS[id].available) {
    throw new Error(`Backend "${id}" is not configured in this build.`);
  }
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function clearPreferredBackend(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
