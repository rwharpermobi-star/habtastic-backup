import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export type TypedSupabaseClient = SupabaseClient<Database>;

let clientPromise: Promise<TypedSupabaseClient> | null = null;

/**
 * Lazily resolve the Supabase client.
 *
 * `@supabase/supabase-js` is ~216 kB raw. Importing it statically from modules
 * that live in the eager startup graph (AuthContext, useProfile, telemetry…)
 * forced `supabase-vendor` to download and evaluate BEFORE first paint even
 * though nothing renders from it. Every eager consumer now awaits this helper
 * instead, so the chunk is fetched right after first paint while the shell is
 * already on screen. Lazy routes keep importing `./client` directly — they are
 * behind `React.lazy()` and share the same module instance either way.
 */
export function getSupabase(): Promise<TypedSupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('./client').then((m) => m.supabase as unknown as TypedSupabaseClient);
  }
  return clientPromise;
}

/** Kick off the client download without awaiting it (post-paint warm-up). */
export function preloadSupabase(): void {
  void getSupabase();
}

/**
 * Resolves once the browser has had a chance to paint. Used to keep the
 * Supabase download off the critical rendering path.
 */
export function afterFirstPaint(): Promise<void> {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
