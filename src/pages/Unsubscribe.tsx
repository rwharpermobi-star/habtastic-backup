import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, MailX, CheckCircle2, AlertCircle } from 'lucide-react';
import logo from '@/assets/logo-sm.webp';
import { usePageMeta } from '@/lib/usePageMeta';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

const UNSUBSCRIBE_HEADINGS: Record<State['kind'], string> = {
  loading: 'Checking your unsubscribe link…',
  ready: 'Unsubscribe from emails?',
  submitting: 'Unsubscribing…',
  success: "You're unsubscribed",
  already: 'Already unsubscribed',
  invalid: 'Invalid link',
  error: 'Something went wrong',
};

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: 'loading' });
  usePageMeta({
    title: 'Unsubscribe from Emails — HabTastic AI',
    description: 'Stop receiving HabTastic AI app emails. Account emails like password resets and verification are still sent.',
    canonicalPath: '/unsubscribe',
  });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } },
        );
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: 'invalid' });
          return;
        }
        if (data.valid === false && data.reason === 'already_unsubscribed') {
          setState({ kind: 'already' });
          return;
        }
        if (data.valid === true) {
          setState({ kind: 'ready' });
          return;
        }
        setState({ kind: 'invalid' });
      } catch {
        setState({ kind: 'error', message: 'Unable to validate your link.' });
      }
    })();
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    setState({ kind: 'submitting' });
    try {
      const { data, error } = await supabase.functions.invoke(
        'handle-email-unsubscribe',
        { body: { token } },
      );
      if (error) throw error;
      if (data?.success) {
        setState({ kind: 'success' });
      } else if (data?.reason === 'already_unsubscribed') {
        setState({ kind: 'already' });
      } else {
        setState({ kind: 'error', message: 'Could not complete unsubscribe.' });
      }
    } catch (e) {
      setState({ kind: 'error', message: e?.message ?? 'Something went wrong.' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
        <img src={logo} alt="HabTastic" className="w-14 h-14 mx-auto mb-5" />

        {(state.kind === 'loading' || state.kind === 'submitting') && <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />}
        {state.kind === 'ready' && <MailX className="w-10 h-10 mx-auto mb-3 text-primary" />}
        {(state.kind === 'success' || state.kind === 'already') && <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-primary" />}
        {(state.kind === 'invalid' || state.kind === 'error') && <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive" />}

        <h1 className="text-h3 font-display font-bold text-foreground mb-2">{UNSUBSCRIBE_HEADINGS[state.kind]}</h1>

        {state.kind === 'ready' && (
          <>
            <p className="text-body text-muted-foreground mb-6">
              You'll stop receiving app emails from HabTastic. Critical account emails (password reset, verification) will still be sent.
            </p>
            <Button
              onClick={handleConfirm}
              className="w-full h-12 rounded-btn gradient-primary text-white font-semibold"
            >
              Confirm Unsubscribe
            </Button>
          </>
        )}

        {state.kind === 'success' && (
          <>
            <p className="text-body text-muted-foreground">
              You won't receive app emails from HabTastic anymore. We're sorry to see you go! 👋
            </p>
          </>
        )}

        {state.kind === 'already' && (
          <>
            <p className="text-body text-muted-foreground">
              This email address is already opted out of app emails.
            </p>
          </>
        )}

        {state.kind === 'invalid' && (
          <>
            <p className="text-body text-muted-foreground">
              This unsubscribe link is invalid or expired.
            </p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <p className="text-body text-muted-foreground">{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}
