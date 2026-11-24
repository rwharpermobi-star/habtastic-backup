import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { activeBackend } from '@/integrations/supabase/backendConfig';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, Lock, User, Loader2, Gift, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/winston-mascot-login.jpg';
import PublicFooter from '@/components/PublicFooter';
import { getEmailLinkOrigin } from '@/lib/appOrigin';
import { getSafeRedirect } from '@/lib/safeRedirect';
import { signInWithNativeGoogle } from '@/lib/nativeGoogleAuth';
import { Capacitor } from '@capacitor/core';
import { usePageMeta } from '@/lib/usePageMeta';

const LOGIN_TIMEOUT_MS = 25_000;

function withAuthTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), LOGIN_TIMEOUT_MS);
    promise.then(
      value => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      error => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export default function Auth() {
  // /signup opens the sign-up form directly; /login and /auth default to sign-in.
  const [isLogin, setIsLogin] = useState(
    () => !window.location.pathname.startsWith('/signup'),
  );
  usePageMeta(isLogin
    ? {
        title: 'Sign In — HabTastic AI',
        description: 'Sign in to HabTastic AI to track your habits, keep your streaks going and chat with Winston, your AI habit coach.',
        canonicalPath: '/login',
      }
    : {
        title: 'Create Your Free Account — HabTastic AI',
        description: 'Sign up free for HabTastic AI: track habits, build streaks, earn rewards and get personalised coaching from Winston AI.',
        canonicalPath: '/signup',
      });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [resending, setResending] = useState(false);
  // MFA challenge state (when signed-in user has TOTP enabled)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [connDiag, setConnDiag] = useState<null | { ok: boolean; url: string; status?: number; error?: string }>(null);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const buildId = import.meta.env.VITE_BUILD_ID;
  // Same-origin relative return path (e.g. /login?redirect=/delete-account).
  const safeRedirect = useMemo(() => getSafeRedirect(), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled || error) return;
        // Fail closed: a user with a verified MFA factor must not leave the
        // auth screen until the session has actually reached AAL2.
        if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') return;
        navigate(safeRedirect ?? '/app', { replace: true });
      } catch {
        // Stay on the auth screen when MFA state cannot be established.
      }
    })();

    return () => { cancelled = true; };
  }, [navigate, safeRedirect, user]);

  // Native connectivity probe. In the release APK, "Failed to fetch" on login
  // is almost always a network-layer failure (blocked domain, no connectivity,
  // TLS/DNS error, wrong/dead project ref, or envs stripped from the build).
  // Check the public auth endpoint before sign-in. The REST schema root is
  // admin-only and cannot diagnose a signed-out client's connectivity.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const { url: supaUrl, publishableKey: supaKey, available } = activeBackend;
    if (!available) {
      setConnDiag({
        ok: false,
        url: supaUrl || '(missing backend URL)',
        error: 'Backend URL/key were not bundled into this build.',
      });
      return;
    }
    const projectRef = (() => {
      try { return new URL(supaUrl).hostname.split('.')[0]; } catch { return 'unknown'; }
    })();
    console.log('[authDiag] backend', { projectRef, url: supaUrl, keyLength: supaKey.length });

    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), 8000);

    const probe = async (path: string) => {
      const res = await fetch(`${supaUrl}${path}`, {
        method: 'GET',
        // Publishable keys are API keys, not user JWTs.
        headers: { apikey: supaKey },
        signal: controller.signal,
      });
      return res.status;
    };

    (async () => {
      try {
        const healthStatus = await probe('/auth/v1/health');
        const ok = healthStatus >= 200 && healthStatus < 300;
        window.clearTimeout(t);
        console.log('[authDiag] response', { projectRef, healthStatus });
        setConnDiag({
          ok,
          url: `${supaUrl} (${projectRef})`,
          status: healthStatus,
          error: ok ? undefined : 'The backend rejected the connection check. Please update the app or try again later.',
        });
      } catch (err) {
        window.clearTimeout(t);
        console.error('[authDiag] unreachable', { projectRef, url: supaUrl, err });
        setConnDiag({
          ok: false,
          url: `${supaUrl} (${projectRef})`,
          error: err?.name === 'AbortError' ? 'Timed out after 8s' : (err?.message || String(err)),
        });
      }
    })();

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, []);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      // Strict: 6-char uppercase letters + digits only.
      const cleaned = ref.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      if (cleaned) {
        setReferralCode(cleaned);
        setIsLogin(false);
      }
    }
  }, []);


  const handleResendVerification = async () => {
    if (!email.trim()) {
      toast.error('Please enter your email address first');
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${getEmailLinkOrigin()}/`,
        },
      });
      if (error) throw error;
      toast.success('Verification email resent successfully ✉️');
    } catch (err) {
      toast.error(err.message || 'Failed to resend verification email');
    } finally {
      setResending(false);
    }
  };

  const friendlyAuthError = (raw: string): string => {
    const m = (raw || '').toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid_credentials'))
      return 'Email or password is incorrect. Please try again.';
    if (m.includes('email not confirmed')) return 'Please verify your email before signing in.';
    if (m.includes('user already registered') || m.includes('user_already_exists'))
      return 'An account with this email already exists. Try signing in instead.';
    if (m.includes('rate limit') || m.includes('too many'))
      return 'Too many attempts. Please wait a minute and try again.';
    if (m.includes('password should be') || m.includes('weak password'))
      return 'Password is too weak. Use at least 6 characters.';
    if (m.includes('network') || m.includes('failed to fetch'))
      return 'Network issue. Check your connection and try again.';
    return raw || 'Something went wrong';
  };

  const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailNorm = email.trim().toLowerCase();
    if (!emailNorm || !password.trim()) {
      toast.error('Please enter your email and password.');
      return;
    }
    if (!isValidEmail(emailNorm)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (!isLogin && !name.trim()) {
      toast.error('Please enter your name.');
      return;
    }

    setLoading(true);
    setInlineError(null);
    setShowVerificationMessage(false);
    // Check the same resolved backend used by the Supabase client.
    if (!activeBackend.available) {
      const msg = 'This app build is missing its connection settings. Please install the latest update.';
      setInlineError(msg);
      toast.error(msg);
      setLoading(false);
      return;
    }
    try {
      if (isLogin) {
        const { error, session: authSession } = await withAuthTimeout(
          signIn(emailNorm, password),
          'Login request timed out after 25 seconds. Check your connection and try again.',
        );
        if (error) {
          const raw = error.message || 'Unknown authentication error';
          const isUnconfirmed = raw.toLowerCase().includes('email not confirmed');
          if (isUnconfirmed) setShowVerificationMessage(true);
          const friendly = friendlyAuthError(raw);
          setInlineError(friendly);
          toast.error(friendly);
          return;
        }
        if (!authSession) {
          setInlineError('Login did not create a session. Please try again.');
          toast.error('Login did not create a session.');
          return;
        }
        // Check whether 2FA is required
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const totp = (factors?.totp || []).find(f => f.status === 'verified');
            if (totp) {
              const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
              if (chErr) throw chErr;
              setMfaFactorId(totp.id);
              setMfaChallengeId(ch.id);
              return;
            }
          }
        } catch (mfaErr) {
          console.error('MFA check failed', mfaErr);
          await supabase.auth.signOut();
          setInlineError('Could not verify your two-factor status. Please sign in again.');
          toast.error('Could not verify two-factor security. Sign-in was stopped.');
          return;
        }
        toast.success('Welcome back, superstar! 💪');
        navigate(safeRedirect ?? '/', { replace: true });
      } else {
        if (password.length < 6) {
          toast.error('Password must be at least 6 characters');
          setLoading(false);
          return;
        }

        // Validate referral code BEFORE creating the account
        let validatedCode: string | null = null;
        if (referralCode.trim()) {
          const code = referralCode.trim().toUpperCase();
          if (!/^[A-Z0-9]{6}$/.test(code)) {
            toast.error('Referral codes are 6 characters (A–Z, 0–9)');
            setLoading(false);
            return;
          }

          // Codes are verified server-side on redemption (redeem_referral) once
          // the account exists — signed-out visitors can't query referral rows.
          validatedCode = code;
        }

        const { error } = await signUp(emailNorm, password, name.trim());
        if (error) {
          const lower = error.message?.toLowerCase() || '';
          if (lower.includes('already registered') || lower.includes('user_already_exists')) {
            toast.error('That email is already registered. Switched to sign in — enter your password.');
            setIsLogin(true);
            setLoading(false);
            return;
          }
          toast.error(friendlyAuthError(error.message));
          setLoading(false);
          return;
        }

        if (validatedCode) {
          localStorage.setItem('pending_referral_code', validatedCode);
        }

        localStorage.setItem('pending_verification_email', emailNorm);
        setShowVerificationMessage(true);
        toast.success('A verification email has been sent. Please check your inbox and spam folder. 📧');
      }
    } catch (e) {
      const raw = e?.message || String(e);
      setInlineError(friendlyAuthError(raw));
      toast.error(friendlyAuthError(raw));
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async () => {
    if (!mfaFactorId || !mfaChallengeId) return;
    setMfaSubmitting(true);
    try {
      if (!/^\d{6}$/.test(mfaCode)) {
        toast.error('Enter the 6-digit code from your authenticator app');
        setMfaSubmitting(false);
        return;
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId, challengeId: mfaChallengeId, code: mfaCode,
      });
      if (error) { toast.error('Incorrect code. Try again.'); setMfaSubmitting(false); return; }
      toast.success('Welcome back! 🛡️');
      setMfaFactorId(null); setMfaChallengeId(null); setMfaCode('');
      navigate(safeRedirect ?? '/', { replace: true });
    } catch (e) {
      toast.error(e?.message || 'Verification failed');
    } finally { setMfaSubmitting(false); }
  };

  const cancelMfa = async () => {
    await supabase.auth.signOut();
    setMfaFactorId(null); setMfaChallengeId(null); setMfaCode('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      {/* Gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="w-24 h-24 mx-auto mb-5 rounded-full overflow-hidden">
            <img src={logo} alt="" aria-hidden="true" className="w-full h-full object-cover rounded-full mix-blend-screen" />
          </div>
          <h1 className="text-h2 font-display text-gradient font-bold tracking-tight">HabTastic AI — Habit Tracking &amp; AI Coaching</h1>
          <p className="text-body text-muted-foreground mt-2">
            {isLogin ? 'Welcome back, superstar! 🌟' : 'Start your winning streak 🎯'}
          </p>
        </div>

        {showVerificationMessage && (
          <div className="bg-card border border-primary/40 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm font-semibold text-foreground mb-1">
              ⏳ Awaiting email verification
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              We sent a confirmation link to <span className="font-medium text-foreground">{email || 'your email'}</span>. Click it to activate your account, then sign in.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendVerification}
              disabled={resending}
              className="text-xs"
            >
              {resending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Resend Verification Email
            </Button>
          </div>
        )}

        {mfaFactorId && mfaChallengeId ? (
          <div className="bg-card border border-primary/40 rounded-xl p-5 space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">Two-Factor Required 🛡️</h2>
              <p id="mfa-instructions" className="text-xs text-muted-foreground mt-1">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
            <label htmlFor="mfa-code" className="sr-only">
              Authenticator code
            </label>
            <Input
              id="mfa-code"
              name="mfa_code"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby="mfa-instructions"
              className="h-12 text-center font-mono text-lg tracking-widest"
              autoFocus
            />
            <Button onClick={submitMfa} disabled={mfaSubmitting || !mfaCode}
              className="w-full h-12 rounded-input gradient-primary text-white font-semibold">
              {mfaSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
            </Button>
            <div className="flex justify-end text-xs">
              <button type="button" className="text-muted-foreground hover:text-destructive" onClick={cancelMfa}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {connDiag && !connDiag.ok && (
            <div
              id="auth-connection-error"
              role="alert"
              aria-live="polite"
              className="bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-300 rounded-xl p-3 text-xs whitespace-pre-wrap break-words"
            >
              <p className="font-semibold mb-1">⚠️ Cannot reach the HabTastic backend</p>
              <p>URL: {connDiag.url}</p>
              {typeof connDiag.status === 'number' && <p>HTTP status: {connDiag.status}</p>}
              {connDiag.error && <p>Reason: {connDiag.error}</p>}
              <p className="mt-1 opacity-80">Check your Wi-Fi/mobile data and make sure you have the latest app update.</p>
            </div>
          )}
          {inlineError && (
            <div
              id="auth-error"
              role="alert"
              aria-live="polite"
              className="bg-destructive/10 border border-destructive/40 text-destructive rounded-xl p-3 text-xs whitespace-pre-wrap break-words"
            >
              {inlineError}
            </div>
          )}
          {!isLogin && (
            <>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
                <label htmlFor="auth-name" className="sr-only">Your name</label>
                <Input
                  id="auth-name"
                  name="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                  className="pl-10 bg-card border-border rounded-input h-12"
                  maxLength={30}
                />
              </div>
              <div className="relative">
                <Gift className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
                <label htmlFor="auth-referral" className="sr-only">Referral code (optional)</label>
                <Input
                  id="auth-referral"
                  name="referral_code"
                  value={referralCode}
                  onChange={e => {
                    const raw = e.target.value;
                    // If user pasted an invite link like https://habtastic.com/?ref=ABC123,
                    // extract the 6-char code. Strict: uppercase letters + digits only.
                    const refMatch = raw.match(/[?&]ref=([A-Za-z0-9]{6})/);
                    const cleaned = (refMatch ? refMatch[1] : raw)
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6);
                    setReferralCode(cleaned);
                  }}
                  placeholder="6-character referral code (optional)"
                  className="pl-10 bg-card border-border rounded-input h-12 font-mono tracking-wider"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={6}
                  aria-invalid={referralCode.length > 0 && referralCode.length < 6}
                />
                {referralCode.length > 0 && referralCode.length < 6 && (
                  <p className="text-xs text-destructive mt-1 pl-1">
                    Referral codes are exactly 6 characters (A–Z, 0–9).
                  </p>
                )}

              </div>
            </>
          )}
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
            <label htmlFor="auth-email" className="sr-only">Email address</label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              data-testid="auth-email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              required
              aria-describedby={inlineError ? 'auth-error' : undefined}
              className="pl-10 bg-card border-border rounded-input h-12"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
            <label htmlFor="auth-password" className="sr-only">Password</label>
            <Input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              data-testid="auth-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              aria-describedby={inlineError ? 'auth-error' : undefined}
              className="pl-10 pr-11 bg-card border-border rounded-input h-12"
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {isLogin && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs text-primary hover:underline"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <Button
            type="submit"
            data-testid="auth-submit"
            disabled={loading}
            className="w-full h-12 rounded-btn gradient-primary text-white font-semibold text-btn active:scale-[0.98] transition-transform glow-primary"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLogin ? "Let's Go! 🚀" : 'Start Winning 💥'}
          </Button>
        </form>
        )}

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setInlineError(null);
            try {
              if (Capacitor.isNativePlatform()) {
                const result = await signInWithNativeGoogle();
                if (result.error) throw result.error;
                navigate(safeRedirect ?? '/', { replace: true });
              } else {
                // Supabase Auth has the Google provider enabled for this project;
                // the Lovable OAuth broker does not, so go direct.
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    // Always return to the exact origin the user is on so the
                    // Supabase redirect allowlist match is deterministic.
                    redirectTo: `${window.location.origin}${safeRedirect ?? '/'}`,
                    queryParams: { prompt: 'select_account' },
                  },
                });
                if (error) throw error;
                // Browser redirects to Google; nothing else to do here.
              }

            } catch (e) {
              const raw = e?.message || 'Google sign-in failed';
              const friendly = friendlyAuthError(raw);
              setInlineError(friendly);
              toast.error(friendly);
            } finally {
              setLoading(false);
            }
          }}
          className="w-full h-12 rounded-btn bg-card border-border font-semibold text-btn active:scale-[0.98] transition-transform flex items-center justify-center gap-3"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09A6.99 6.99 0 0 1 5.47 12c0-.73.13-1.43.36-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          Continue with Google
        </Button>

        <p className="text-center text-body text-muted-foreground mt-8">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button onClick={() => { setIsLogin(!isLogin); setShowVerificationMessage(false); }} className="text-primary font-semibold hover:underline">
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>

        {buildId && (
          <p className="text-center text-[10px] text-muted-foreground/60 mt-3 select-all">
            Build {buildId}
          </p>
        )}

        <PublicFooter />
      </div>
    </div>
  );
}
