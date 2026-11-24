import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, LogIn, Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import PublicFooter from '@/components/PublicFooter';
import { usePageMeta } from '@/lib/usePageMeta';
import { ADMIN_EMAIL } from '@/lib/contactEmails';

/**
 * Public account & data deletion page (Google Play data-deletion requirement).
 * Reachable at /delete-account whether signed in or signed out.
 */
export default function DeleteAccount() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  usePageMeta({
    title: 'Delete Your Account — HabTastic AI',
    description:
      'Request permanent deletion of your HabTastic AI account and associated personal data, or delete your account instantly while signed in.',
    canonicalPath: '/delete-account',
  });

  const handleDelete = async () => {
    if (confirmText.trim() !== 'DELETE' || deleting) return;
    setDeleting(true);
    try {
      const { data: renewing, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('provider,status,cancel_at_period_end')
        .eq('user_id', user!.id)
        .in('status', ['active', 'attention', 'trialing'])
        .eq('cancel_at_period_end', false)
        .limit(1);

      if (subscriptionError) throw subscriptionError;
      if (renewing && renewing.length > 0) {
        const provider = renewing[0].provider === 'google_play' ? 'Google Play' : 'Paystack';
        toast.error(`Cancel your auto-renewing ${provider} subscription before deleting your account.`);
        setDeleting(false);
        return;
      }

      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      toast.success('Your account has been permanently deleted.');
      await signOut();
      navigate('/');
    } catch {
      toast.error('Could not delete your account. Please try again or email support.');
      setDeleting(false);
    }
  };

  return (
    <motion.div
      className="min-h-screen pb-12 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm"
        aria-label="Go back"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-xl bg-destructive/15 flex items-center justify-center">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <h1 className="text-h1 text-foreground">Delete Your Account</h1>
      </div>

      <section className="space-y-6 text-foreground/90 text-[15px] leading-relaxed max-w-2xl">
        <p>
          This page explains how to permanently delete your{' '}
          <strong>HabTastic AI</strong> account (app package{' '}
          <code className="text-xs">app.lovable.habtastic</code>) and the personal
          data associated with it. HabTastic AI is a habit-tracking app published
          by HabTastic Ai.
        </p>

        <div>
          <h2 className="text-lg font-semibold mb-2">What gets deleted</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your login account and email address</li>
            <li>Your profile, avatar images and display name</li>
            <li>Habits, schedules, completions, streaks, XP, coins and gems</li>
            <li>Journal entries, legacy server-stored diary entries, mood check-ins and AI coach chats</li>
            <li>Friends, referrals, challenges, community posts and reactions</li>
            <li>Push notification tokens and notification preferences</li>
          </ul>
        </div>

        <div className="rounded-card border border-primary/30 bg-primary/5 p-4 space-y-2">
          <h2 className="text-lg font-semibold">Google Drive diary backup</h2>
          <p className="text-sm text-muted-foreground">
            If you enabled My Diary Google Drive sync, that backup lives in your
            own Google Drive application data. Deleting your HabTastic account
            removes HabTastic server data but does not automatically delete the
            user-owned Google Drive backup. You can remove HabTastic app data from
            your Google Drive account settings.
          </p>
        </div>

        <div className="rounded-card border border-amber-500/35 bg-amber-500/5 p-4 space-y-2">
          <h2 className="text-lg font-semibold">Cancel renewal before deleting</h2>
          <p className="text-sm text-muted-foreground">
            Deleting your HabTastic AI account does not itself cancel an external paid
            subscription. If you have an auto-renewing subscription, cancel renewal first.
            Google Play subscriptions can be managed in{' '}
            <a
              href="https://play.google.com/store/account/subscriptions?package=app.lovable.habtastic"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google Play Subscriptions
            </a>
            . Paystack web subscriptions can be cancelled from HabTastic Settings while
            you are signed in. Once renewal is cancelled, you can return here and delete
            the account. Deleting the account ends access immediately even if paid time remains.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">What may be retained</h2>
          <p>
            In line with our{' '}
            <a href="/privacy" className="text-primary underline">
              Privacy Policy
            </a>
            , personal data is deleted or anonymised within{' '}
            <strong>30 days</strong>. Billing and tax records for Paystack
            transactions may be retained for up to <strong>7 years</strong> where
            required by law, and encrypted backups containing residual data are
            rotated and overwritten within <strong>90 days</strong>.
          </p>
        </div>

        {user ? (
          <div className="rounded-card border border-destructive/40 p-4 space-y-3">
            <h2 className="text-lg font-semibold">Delete my account</h2>
            <p className="text-sm text-muted-foreground">
              Signed in as <strong className="text-foreground">{user.email}</strong>.
              This action is <strong className="text-destructive">permanent and
              cannot be undone</strong>. Type <strong className="text-destructive">DELETE</strong>{' '}
              below to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              aria-label="Type DELETE to confirm"
              className="rounded-btn"
            />
            <Button
              onClick={handleDelete}
              disabled={deleting || confirmText.trim() !== 'DELETE'}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting…
                </>
              ) : (
                'Permanently Delete My Account'
              )}
            </Button>
          </div>
        ) : (
          <div className="rounded-card border border-border/60 p-4 space-y-3">
            <h2 className="text-lg font-semibold">Sign in to delete your account</h2>
            <p className="text-sm text-muted-foreground">
              For your security, we must verify it's really you. Sign in and
              you'll be returned to this page to complete deletion.
            </p>
            <Button
              onClick={() => navigate('/login?redirect=/delete-account')}
              className="w-full"
            >
              <LogIn className="w-4 h-4 mr-2" /> Sign in and return here
            </Button>
            <p className="text-sm text-muted-foreground">
              Can't sign in? Email us from the address on your account and we'll
              process the deletion manually:
            </p>
            <a
              href={`mailto:${ADMIN_EMAIL}?subject=Account%20deletion%20request%20(HabTastic%20AI)`}
              className="inline-flex items-center gap-2 text-primary underline text-sm"
            >
              <Mail className="w-4 h-4" /> {ADMIN_EMAIL}
            </a>
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold mb-2">Questions</h2>
          <p>
            For privacy enquiries contact{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>
            . Support requests:{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>

      <PublicFooter />
    </motion.div>
  );
}
