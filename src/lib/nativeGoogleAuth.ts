import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const NATIVE_GOOGLE_REDIRECT_URI = 'lovable://oauth-callback';
const GOOGLE_TIMEOUT_MS = 120_000;
const NETWORK_CHECK_TIMEOUT_MS = 10_000;

type NativeGoogleResult = { error: Error | null };
type AppListener = { remove: () => Promise<void> };

function createOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function readOAuthCallback(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  if (parsed.hash) {
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    hashParams.forEach((value, key) => params.set(key, value));
  }
  return params;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function toError(error: unknown, fallback = 'Google sign-in failed. Please try again.'): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string' && error.trim()) return new Error(error);
  return new Error(fallback);
}

function trace(stage: string, detail?: string) {
  const line = `[google-auth] ${stage}${detail ? `: ${detail}` : ''}`;
  console.info(line);
  try {
    const key = 'google_auth_trace';
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as string[];
    prev.push(`${new Date().toISOString()} ${line}`);
    localStorage.setItem(key, JSON.stringify(prev.slice(-25)));
  } catch {
    // Diagnostics are best-effort only.
  }
}

async function checkBackendReachable(): Promise<Error | null> {
  const supaUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supaKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supaUrl || !supaKey) {
    return new Error(
      'This Android build is missing backend configuration. Please install the newest build.',
    );
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NETWORK_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${supaUrl}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: supaKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      return new Error(`HabTastic backend check failed before Google sign-in (HTTP ${response.status}).`);
    }
    return null;
  } catch (error) {
    const err = toError(error, 'Network check failed before Google sign-in.');
    const reason = err.name === 'AbortError' ? 'timed out' : err.message;
    return new Error(
      `Your phone cannot reach the HabTastic backend right now (${reason}). Check your connection and try again.`,
    );
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function setSessionWithRetry(accessToken: string, refreshToken: string): Promise<Error | null> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) return null;
    lastError = new Error(error.message);
    if (attempt < 3) await delay(attempt * 750);
  }
  return lastError ?? new Error('Google sign-in returned a session, but HabTastic could not save it.');
}

async function handleOAuthCallbackUrl(
  url: string,
  expectedState: string,
): Promise<NativeGoogleResult | null> {
  if (!url.startsWith(NATIVE_GOOGLE_REDIRECT_URI)) return null;

  const params = readOAuthCallback(url);
  const returnedState = params.get('native_state');
  if (returnedState && returnedState !== expectedState) return null;

  const providerError = params.get('error_description') || params.get('error');
  if (providerError) return { error: new Error(providerError) };

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { error: await setSessionWithRetry(accessToken, refreshToken) };
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { error: error ? new Error(error.message) : null };
  }

  return { error: new Error('Google sign-in returned without a valid session.') };
}

async function signInWithBrowserGoogle(): Promise<NativeGoogleResult> {
  const expectedState = createOAuthState();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: NATIVE_GOOGLE_REDIRECT_URI,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) return { error: new Error(error.message) };
  if (!data.url) return { error: new Error('Google sign-in could not start. Please try again.') };

  let urlListener: AppListener | null = null;
  let stateListener: AppListener | null = null;
  let timeoutId: number | undefined;
  let settled = false;
  const seenUrls = new Set<string>();

  try {
    trace('browser-only/start');
    return await new Promise<NativeGoogleResult>(resolve => {
      const finish = async (value: NativeGoogleResult) => {
        if (settled) return;
        settled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
        if (urlListener) {
          await urlListener.remove();
          urlListener = null;
        }
        if (stateListener) {
          await stateListener.remove();
          stateListener = null;
        }
        await Browser.close().catch(() => undefined);
        resolve(value);
      };

      const tryUrl = async (url?: string | null) => {
        if (!url || settled || seenUrls.has(url)) return;
        seenUrls.add(url);
        try {
          const callbackResult = await handleOAuthCallbackUrl(url, expectedState);
          if (callbackResult) await finish(callbackResult);
        } catch (callbackError) {
          await finish({ error: toError(callbackError) });
        }
      };

      void (async () => {
        timeoutId = window.setTimeout(() => {
          void finish({
            error: new Error(
              'Google sign-in timed out before HabTastic received the Android callback. Please try again.',
            ),
          });
        }, GOOGLE_TIMEOUT_MS);

        urlListener = await App.addListener('appUrlOpen', event => {
          void tryUrl(event.url);
        });

        await App.getLaunchUrl()
          .then(result => {
            if (result?.url) seenUrls.add(result.url);
          })
          .catch(() => undefined);

        stateListener = await App.addListener('appStateChange', state => {
          if (!state.isActive) return;
          void App.getLaunchUrl()
            .then(result => tryUrl(result?.url))
            .catch(() => undefined);
        });

        await Browser.open({ url: data.url });
      })().catch(startError => {
        void finish({ error: toError(startError) });
      });
    });
  } catch (error) {
    if (timeoutId) window.clearTimeout(timeoutId);
    if (urlListener) await urlListener.remove();
    if (stateListener) await stateListener.remove();
    await Browser.close().catch(() => undefined);
    return { error: toError(error) };
  }
}

/**
 * Android Google sign-in intentionally uses one flow only: Supabase OAuth in a
 * Custom Tab. Previous native-first attempts could show an account picker and
 * then fall back to OAuth, forcing users to choose their Google account twice.
 * Keeping the exported name avoids touching the stable Auth page integration.
 */
export async function signInWithNativeGoogle(): Promise<NativeGoogleResult> {
  if (!Capacitor.isNativePlatform()) {
    return { error: new Error('Android Google sign-in is only available in the installed app.') };
  }

  const backendError = await checkBackendReachable();
  if (backendError) return { error: backendError };

  return signInWithBrowserGoogle();
}
