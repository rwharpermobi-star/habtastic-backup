/**
 * Removes Supabase auth/session entries in localStorage that belong to a
 * *different* Supabase project than the one this build is pointed at.
 *
 * Why: when a project is migrated to a new Supabase backend, browsers (and
 * installed PWAs) keep the old `sb-<old-ref>-auth-token` key around. The
 * Supabase client ignores it, but it keeps the old project ref alive in the
 * app's storage and can confuse debugging tools and stale integrations.
 */
import { activeBackend } from '@/integrations/supabase/backendConfig';

// Ref of the backend this session is actually bound to (the switcher may point
// the app at a different project than the build default).
const CURRENT_REF =
  activeBackend.projectId ||
  activeBackend.url.match(/https?:\/\/([^.]+)\./)?.[1] ||
  undefined;

export function purgeStaleSupabaseAuth() {
  if (typeof window === 'undefined' || !CURRENT_REF) return;
  try {
    const stale = Object.keys(window.localStorage).filter(
      (key) => key.startsWith('sb-') && key.includes('-auth-token') && !key.includes(CURRENT_REF),
    );
    for (const key of stale) {
      window.localStorage.removeItem(key);
      console.info('[supabase] Removed stale session key from a previous project:', key);
    }
  } catch {
    // localStorage can be unavailable (private mode / blocked storage) — ignore.
  }
}
