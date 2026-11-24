import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { assertPasswordIsNotCompromised } from '@/lib/pwnedPassword';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Loader2, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/logo-sm.webp';
import { usePageMeta } from '@/lib/usePageMeta';

export default function ResetPassword() {
  usePageMeta({
    title: 'Choose a New Password — HabTastic AI',
    description: 'Set a new password for your HabTastic AI account.',
    canonicalPath: '/reset-password',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Recovery links may arrive as:
    //  - Hash tokens: #access_token=...&type=recovery (implicit flow)
    //  - PKCE code:   ?code=... (Supabase auto-exchanges via detectSessionInUrl)
    const hash = window.location.hash;
    const search = window.location.search;
    if (hash.includes('type=recovery') || search.includes('code=')) {
      setIsRecovery(true);
    }

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
      // If a session materializes on this page (from the recovery link exchange),
      // trust it as a recovery context so the form is available.
      if (event === 'SIGNED_IN' && session) setIsRecovery(true);
    });

    // Also check if we already have a session (link already exchanged).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setIsRecovery(true);
    });

    return () => subscription.unsubscribe();
  }, []);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await assertPasswordIsNotCompromised(password);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      toast.success('Password updated successfully!');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4">
            <img src={logo} alt="HabTastic" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-muted-foreground mb-6">This link is invalid or has expired. Please request a new password reset.</p>
          <Button onClick={() => navigate('/forgot-password')} className="w-full h-12 rounded-btn gradient-primary text-white font-semibold">
            Request New Link
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h1 className="text-xl font-bold text-foreground mb-2">Password Updated! 🎉</h1>
          <p className="text-sm text-muted-foreground">Redirecting you to the app...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4">
            <img src={logo} alt="HabTastic" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Set New Password</h1>
          <p className="text-sm text-muted-foreground mt-2">Choose a strong password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password"
              className="pl-10 pr-11 bg-card border-border rounded-input h-12"
              minLength={6}
              required
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
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
            <Input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="pl-10 pr-11 bg-card border-border rounded-input h-12"
              minLength={6}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(s => !s)}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-btn gradient-primary text-white font-semibold active:scale-[0.98] transition-transform"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password 🔐'}
          </Button>
        </form>
      </div>
    </div>
  );
}
