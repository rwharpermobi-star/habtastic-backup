import { supabase } from '@/integrations/supabase/client';
import { activeBackend } from '@/integrations/supabase/backendConfig';

/**
 * Direct fetch() calls to Supabase Edge Functions (Winston chat, Winston voice,
 * Winston challenges).
 *
 * Why this exists:
 * capacitor.config.ts enables CapacitorHttp so Google Drive sync can avoid
 * WebView CORS. CapacitorHttp replaces window.fetch on Android with a native
 * bridge that:
 *   - reads every non-JSON response as a UTF-8 string, so ElevenLabs MP3 audio
 *     arrives corrupted and Winston never speaks;
 *   - buffers the whole response, so the streamed chat (SSE) cannot stream;
 *   - ignores AbortController, so timeouts and "tap to stop" do nothing.
 * Capacitor keeps the original WebView fetch on window.CapacitorWebFetch. Our
 * Edge Functions send permissive CORS headers, so the WebView fetch works the
 * same way it does on the web build.
 *
 * It also always sends a fresh access token plus the project apikey, instead of
 * a possibly-expired token captured in React state.
 */

type FetchFn = typeof fetch;

export function getWebFetch(): FetchFn {
  const w = (typeof window !== 'undefined' ? window : undefined) as
    | (Window & { CapacitorWebFetch?: FetchFn })
    | undefined;
  const original = w?.CapacitorWebFetch;
  if (typeof original === 'function') return original.bind(w) as FetchFn;
  return fetch.bind(globalThis) as FetchFn;
}

export function edgeFunctionUrl(name: string): string {
  return `${activeBackend.url.replace(/\/+$/, '')}/functions/v1/${name}`;
}

export class NotSignedInError extends Error {
  serviceStatus = 401;
  constructor() {
    super('Your sign-in has expired. Please sign out and sign in again.');
    this.name = 'NotSignedInError';
  }
}

/** Returns a valid access token, refreshing it first when it is about to expire. */
export async function getFreshAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }
  return session.access_token;
}

export async function edgeFunctionFetch(
  name: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const { accessToken: providedToken, headers: initHeaders, ...rest } = init;
  const token = providedToken || (await getFreshAccessToken());
  if (!token) throw new NotSignedInError();

  const headers = new Headers(initHeaders);
  headers.set('Authorization', `Bearer ${token}`);
  if (activeBackend.publishableKey) headers.set('apikey', activeBackend.publishableKey);
  if (!headers.has('Content-Type') && typeof rest.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return getWebFetch()(edgeFunctionUrl(name), { ...rest, headers });
}
