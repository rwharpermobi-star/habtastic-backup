import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { getSupabase, afterFirstPaint } from '@/integrations/supabase/lazyClient';
import type { User, Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ensurePushSubscriptionWithRetry, isWebPushSupported } from '@/lib/webPush';
import { clearPremiumCache } from '@/lib/premiumCache';
import { profileQueryKey } from '@/hooks/profileCache';
import { getEmailLinkOrigin } from '@/lib/appOrigin';
import { markAuthBootStart, markAuthHydrated } from '@/lib/authTelemetry';
import { assertPasswordIsNotCompromised } from '@/lib/pwnedPassword';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; session: Session | null; user: User | null }>;
  signOut: () => Promise<void>;
  checkSubscription: (userId?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const WELCOME_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;

function shouldQueueWelcomeEmail(user: User): boolean {
  if (!user.email) return false;
  const createdAt = Date.parse(user.created_at);
  if (!Number.isFinite(createdAt)) return false;
  const accountAge = Date.now() - createdAt;
  return accountAge >= 0 && accountAge <= WELCOME_EMAIL_WINDOW_MS;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const subCheckDone = useRef(false);
  const queryClient = useQueryClient();

  // Latest signed-in user id, read at call time. Callbacks registered once
  // (auth listener, resume listeners) must never capture a stale/null user.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  const checkSubscription = useCallback(async (userId?: string) => {
    // Subscription state is written server-side (Paystack webhooks, Google
    // Play verify/RTDN) into profiles. Refetch so the UI reflects it.
    const id = typeof userId === 'string' && userId ? userId : userIdRef.current;
    if (id) {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(id), exact: true });
    }
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    markAuthBootStart();

    // Hard safety net: no matter what happens with the network or Supabase
    // client, `loading` must resolve within 10s so the app never gets stuck
    // on a blank splash / infinite PageLoader. If we hit this we treat the
    // user as signed-out — they can retry from /auth.
    const bootTimeout = window.setTimeout(() => {
      if (cancelled) return;
      console.warn('[auth] Boot timeout — releasing loading state');
      setLoading(false);
    }, 10_000);

    let validatedUser: User | null = null;
    const boot = async () => {
      try {
        // Yield to the browser so the app shell paints before the ~216 kB
        // Supabase client is fetched and evaluated.
        await afterFirstPaint();
        const { data: { session: initialSession } } = await (await getSupabase()).auth.getSession();

        // Validate against the auth server so a stale JWT (user deleted, key
        // rotated, etc.) doesn't leave the app firing authenticated calls
        // that all 401. Wrapped in its own try so a network flake here does
        // NOT strand the boot — we fall back to the cached session.
        let validatedSession = initialSession;
        if (initialSession?.user) {
          try {
            const { data: userData, error: userErr } = await (await getSupabase()).auth.getUser();
            if (userErr || !userData.user) {
              // Only sign out on explicit "user not found" style errors, not
              // on transient network failures. Message check keeps offline
              // starts from nuking a valid session.
              const msg = (userErr?.message || '').toLowerCase();
              const isNetworkErr = msg.includes('failed to fetch') || msg.includes('network');
              // On native shells the restored session comes from async native
              // storage and the WebView may still be coming online — never drop
              // it here; autoRefreshToken / the auth listener will correct it.
              const { isNativeApp } = await import('@/integrations/supabase/nativeAuthStorage');
              if (!isNetworkErr && !isNativeApp()) {
                await (await getSupabase()).auth.signOut().catch(() => {});
                validatedSession = null;
              }
            }
          } catch (verifyErr) {
            // Network error — keep the cached session so offline start still works.
            console.warn('[auth] Session verify failed, using cached session:', verifyErr);
          }
        }

        if (cancelled) return;
        validatedUser = validatedSession?.user ?? null;
        setSession(validatedSession);
        setUser(validatedSession?.user ?? null);
        if (validatedSession?.user && !subCheckDone.current) {
          subCheckDone.current = true;
          checkSubscription(validatedSession.user.id);
        }
      } catch (err) {
        console.error('[auth] Boot failed:', err);
        if (!cancelled) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          markAuthHydrated(Boolean(validatedUser), 'boot');
        }
        window.clearTimeout(bootTimeout);
      }
    };

    boot();

    // The auth listener is registered as soon as the (lazily loaded) client is
    // ready. `unsubscribe` is stashed so an unmount before that resolves still
    // tears the listener down.
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      await afterFirstPaint();
      const client = await getSupabase();
      const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      markAuthHydrated(Boolean(session?.user), 'auth_event');
      if (_event === 'SIGNED_IN' && session?.user) {
        // Email-confirmation signups do not receive a session from signUp(), so
        // enqueue the welcome message on the first authenticated event instead.
        // OAuth signups use this path too. The backend idempotency claim makes
        // repeat SIGNED_IN events safe for accounts created in the last 24h.
        if (shouldQueueWelcomeEmail(session.user)) {
          const accountEmail = session.user.email!.trim().toLowerCase();
          const rawName = session.user.user_metadata?.name ?? session.user.user_metadata?.full_name;
          const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : undefined;
          void client.functions
            .invoke('send-transactional-email', {
              body: {
                templateName: 'welcome',
                recipientEmail: accountEmail,
                idempotencyKey: `welcome-${session.user.id}`,
                templateData: { name },
              },
            })
            .then(({ error }) => {
              if (error) console.warn('[auth] Welcome email enqueue failed:', error.message);
            })
            .catch((error) => console.warn('[auth] Welcome email enqueue failed:', error));
        }

        // Show "Email verified" toast once after confirmation flow
        const pendingEmail = localStorage.getItem('pending_verification_email');
        if (pendingEmail && session.user.email_confirmed_at && pendingEmail === session.user.email) {
          localStorage.removeItem('pending_verification_email');
          toast.success('Email verified ✅ Welcome aboard!');
        }
        // Redeem pending referral code with device fingerprint for fraud signals
        const pendingCode = localStorage.getItem('pending_referral_code');
        if (pendingCode) {
          localStorage.removeItem('pending_referral_code');
          try {
            const { getDeviceFingerprint } = await import('@/lib/deviceFingerprint');
            const fingerprint = await getDeviceFingerprint();
            const { data: redeemData, error: redeemErr } = await (await getSupabase()).rpc('redeem_referral', {
              _code: pendingCode.trim().toUpperCase(),
              _fingerprint: fingerprint,
              _ip: null,
            } as any);
            if (redeemErr) {
              console.warn('[referral] redeem failed:', redeemErr.message);
              toast.error('We could not apply that referral code. You can continue using HabTastic.');
            } else if ((redeemData as any)?.ok === true) {
              const referralId = (redeemData as any)?.referral_id;
              if (typeof referralId === 'string') {
                const { error: rewardError } = await (await getSupabase()).functions.invoke('referral-signup-reward', {
                  body: { referral_id: referralId },
                });
                if (rewardError) {
                  // The referral link is saved; a failed optional reward processor must not
                  // undo signup or report the referral itself as invalid.
                  console.warn('[referral] signup reward processor failed:', rewardError.message);
                }
              }
              setTimeout(() => {
                window.location.assign(`/referral-applied?code=${encodeURIComponent(pendingCode)}`);
              }, 250);
            } else {
              const reason = (redeemData as any)?.error;
              const message = reason === 'new_users_only'
                ? 'Referral codes are only available to newly registered accounts.'
                : reason === 'duplicate_device'
                  ? 'This device has already used a referral code.'
                  : reason === 'self_referral'
                    ? 'You cannot use your own referral code.'
                    : reason === 'already_redeemed'
                      ? 'A referral code has already been used on this account.'
                      : 'That referral code is invalid or has already been used.';
              toast.error(message);
              console.warn('[referral] code was not applied:', reason || 'unknown');
            }
          } catch (err) {
            console.error('Referral redeem failed:', err);
          }

        }
        if (!subCheckDone.current) {
          subCheckDone.current = true;
          const signedInId = session.user.id;
          setTimeout(() => checkSubscription(signedInId), 500);
        }
      }
      if (_event === 'SIGNED_OUT') {
        subCheckDone.current = false;
        // Purge every cached query so the next user never sees the previous
        // user's profile/habits/streaks flash.
        queryClient.clear();
      }
      });
      if (cancelled) {
        subscription.unsubscribe();
        return;
      }
      unsubscribe = () => subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(bootTimeout);
      unsubscribe?.();
    };
  }, [checkSubscription, queryClient]);

  // Periodic check every 15 minutes + whenever the app returns to the
  // foreground (tab focus, page visible, native Android resume). Throttled so
  // flipping between apps doesn't trigger a profile invalidation storm, but
  // short enough that a purchase/renewal made elsewhere shows on return.
  useEffect(() => {
    if (!user) return;
    let lastCheck = Date.now();
    const FOREGROUND_THROTTLE_MS = 30_000;
    const interval = setInterval(() => {
      lastCheck = Date.now();
      checkSubscription();
    }, 15 * 60_000);
    const onForeground = () => {
      if (Date.now() - lastCheck < FOREGROUND_THROTTLE_MS) return;
      lastCheck = Date.now();
      checkSubscription();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onForeground();
    };
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onVisibility);

    let removeNative: (() => void) | null = null;
    let disposed = false;
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/app')
        .then(({ App: CapApp }) => CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) onForeground();
        }))
        .then((handle) => {
          if (disposed) void handle.remove();
          else removeNative = () => { void handle.remove(); };
        })
        .catch(() => { /* resume refresh is best-effort; focus/visibility still apply */ });
    }
    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onVisibility);
      removeNative?.();
    };
  }, [user, checkSubscription]);

  // Auto-resubscribe push if user already granted permission (with retries so a
  // transient failure doesn't leave the account without a push subscription).
  useEffect(() => {
    if (!user || !isWebPushSupported()) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      ensurePushSubscriptionWithRetry().catch(() => {});
    }
  }, [user]);


  // Check on checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' && user) {
      checkSubscription();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user, checkSubscription]);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      await assertPasswordIsNotCompromised(password);
    } catch (error) {
      return { error: error as Error };
    }

    const { error } = await (await getSupabase()).auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${getEmailLinkOrigin()}/`,
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await (await getSupabase()).auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error as Error, session: null, user: null };
    }

    if (!data.session || !data.user) {
      return {
        error: new Error('Sign in succeeded but no active session was returned by the backend.'),
        session: null,
        user: null,
      };
    }

    // Confirm the freshly returned token is accepted by the auth server, then
    // update local state immediately so native builds do not wait on event timing.
    const { data: verified, error: verifyError } = await (await getSupabase()).auth.getUser();
    if (verifyError || !verified.user) {
      await (await getSupabase()).auth.signOut();
      return {
        error: (verifyError as Error | null) ?? new Error('Sign in failed because the session could not be verified.'),
        session: null,
        user: null,
      };
    }

    setSession(data.session);
    setUser(data.user);
    setLoading(false);
    return { error: null, session: data.session, user: data.user };
  };

  const signOut = async () => {
    clearPremiumCache();
    subCheckDone.current = false;
    try {
      // Release this device's native push token while the current user's JWT
      // is still valid. The useNativePush sign-out effect runs after auth state
      // changes and can otherwise lose the credentials needed to unregister.
      if (Capacitor.isNativePlatform()) {
        try {
          const token = localStorage.getItem('fcm.lastToken');
          if (token) {
            await (await getSupabase()).functions.invoke('push-token-register', {
              body: { token, platform: Capacitor.getPlatform(), unregister: true },
            });
          }
        } catch (pushError) {
          console.warn('[auth] Native push token cleanup failed during sign-out:', pushError);
        }
      }
      await (await getSupabase()).auth.signOut();
    } finally {
      // Nuke all cached queries so the next login starts clean. Safe to call
      // even if signOut threw (e.g. offline) — the local session is already gone.
      queryClient.clear();
    }
  };

  // Memoize the context value so child consumers don't re-render on every
  // AuthProvider render (e.g. when an unrelated state ticks).
  const value = useMemo(
    () => ({ user, session, loading, signUp, signIn, signOut, checkSubscription }),
    [user, session, loading, checkSubscription],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
