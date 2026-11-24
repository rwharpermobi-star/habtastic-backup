import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ensurePushSubscription, isWebPushSupported } from '@/lib/webPush';
import { getNotificationPermission } from '@/lib/notificationPermission';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DISMISS_KEY = 'notif_prompt_dismissed_at';
const DISMISS_DAYS = 7;

type Mode = 'hidden' | 'web' | 'native';

export default function NotificationPermissionBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('hidden');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    const firstRun = localStorage.getItem('notif_prompt_first_run') === '1';
    if (firstRun) localStorage.removeItem('notif_prompt_first_run');
    if (!firstRun && dismissed) {
      const days = (Date.now() - Number(dismissed)) / 86400000;
      if (days < DISMISS_DAYS) return;
    }

    (async () => {
      const snap = await getNotificationPermission();
      console.log('[notifBanner] permission snapshot', snap);

      // ── Native (Android/iOS): show banner only when the OS permission is
      // not granted, or when it is granted but no device_token row exists yet.
      if (snap.isNative) {
        const { data, error } = await supabase
          .from('device_tokens')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        if (error) console.warn('[notifBanner] device_tokens lookup failed', error.message);
        const hasToken = (data?.length ?? 0) > 0;
        console.log('[notifBanner] FCM registration result: device_tokens rows =', data?.length ?? 0);

        if (cancelled) return;
        if (snap.state === 'granted' && hasToken) return; // fully set up — never warn
        const delay = firstRun ? 300 : 1500;
        setTimeout(() => { if (!cancelled) setMode('native'); }, delay);
        return;
      }

      // ── Web: only prompt when permission is still 'default'
      if (!isWebPushSupported()) return;
      if (snap.state !== 'default') return;
      const delay = firstRun ? 300 : 1500;
      setTimeout(() => { if (!cancelled) setMode('web'); }, delay);
    })();


    return () => { cancelled = true; };
  }, [user]);

  const enableWeb = async () => {
    setBusy(true);
    try {
      const ok = await ensurePushSubscription();
      if (ok) {
        toast.success('Reminders enabled 🎉');
        setMode('hidden');
      } else {
        const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
        if (perm === 'denied') {
          toast.error('Notifications blocked. Allow them in your browser settings.');
        } else {
          toast.error("Couldn't enable notifications. Try again from Settings.");
        }
        dismiss();
      }
    } catch {
      toast.error('Something went wrong. Try again later.');
    } finally {
      setBusy(false);
    }
  };

  const goToSetup = () => {
    setMode('hidden');
    navigate('/settings/notifications-setup');
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setMode('hidden');
  };

  const isNative = mode === 'native';
  const title = isNative ? 'Finish setting up notifications' : 'Never miss a habit';
  const description = isNative
    ? "We can't reach your device yet. Complete a 30-second check so reminders and streak alerts land reliably."
    : 'Turn on reminders to keep your streak alive — we only nudge you when it matters.';
  const ctaLabel = isNative
    ? (<>Set up push <ChevronRight className="w-3.5 h-3.5" /></>)
    : (busy ? 'Enabling…' : (<><Check className="w-3.5 h-3.5" /> Turn on</>));
  const onCta = isNative ? goToSetup : enableWeb;

  return (
    <AnimatePresence>
      {mode !== 'hidden' && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-sm"
        >
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-2 right-2 p-1.5 rounded-full text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm leading-tight">
                {title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                {description}
              </p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={onCta} disabled={busy} className="gap-1.5 h-8">
                  {ctaLabel}
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy} className="h-8 text-muted-foreground">
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
