import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '@/assets/logo-sm.webp';
import { getEmailLinkOrigin } from '@/lib/appOrigin';
import { usePageMeta } from '@/lib/usePageMeta';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  usePageMeta({
    title: 'Reset Your Password — HabTastic AI',
    description: 'Forgot your HabTastic AI password? Enter your email and we will send you a secure link to choose a new one.',
    canonicalPath: '/forgot-password',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${getEmailLinkOrigin()}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      // Always show success to prevent email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <button onClick={() => navigate('/auth')} className="flex items-center gap-1 text-muted-foreground mb-6 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Sign In</span>
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4">
            <img src={logo} alt="HabTastic" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Reset Password</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {sent
              ? "If an account exists for this email, a password reset link has been sent."
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail aria-hidden="true" className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground" />
              <label htmlFor="reset-email" className="sr-only">Email address</label>
              <Input
                id="reset-email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                autoComplete="email"
                className="pl-10 bg-card border-border rounded-input h-12"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-btn gradient-primary text-white font-semibold active:scale-[0.98] transition-transform"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link 📧'}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-2xl mb-2">📬</p>
              <p className="text-sm text-muted-foreground">Check your inbox and spam folder for the reset link.</p>
            </div>
            <Button
              onClick={() => navigate('/auth')}
              variant="outline"
              className="w-full h-12 rounded-btn"
            >
              Back to Sign In
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
