import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Bell, BellOff, Moon, Flame, Award, Calendar, Megaphone, AlertTriangle, Clock, Heart, RefreshCw, ShieldAlert, Check, X as XIcon, Info, Shield } from 'lucide-react';
import { isStreakSaverEnabled, setStreakSaverEnabled } from '@/hooks/useStreakSaver';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useHabits } from '@/hooks/useHabits';
import { useNotificationPrefs, type Tone } from '@/hooks/useNotificationPrefs';

import { usePremium } from '@/hooks/usePremium';
import PremiumBadge from '@/components/PremiumBadge';
import ExactAlarmPrompt from '@/components/ExactAlarmPrompt';
import { ensurePushSubscription, isWebPushSupported, unsubscribePush, lastPushFailure } from '@/lib/webPush';
import { Capacitor } from '@capacitor/core';
import { getNotificationPermission, requestNotificationPermission, type UnifiedPermission } from '@/lib/notificationPermission';
import { supabase } from '@/integrations/supabase/client';
import { isInAppFallbackEnabled, setInAppFallbackEnabled } from '@/hooks/useInAppReminderFallback';
import { getNotificationSettingsHelp, copySettingsUrl } from '@/lib/notificationSettingsHelp';
import { emailReminderSchema, getEmailReminderPrefs, setEmailReminderPrefs } from '@/lib/emailReminderPrefs';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Mail, MessageSquare, ExternalLink, Copy } from 'lucide-react';

const TONES: { value: Tone; label: string; desc: string }[] = [
  { value: 'normal', label: 'Normal', desc: 'Friendly nudges' },
  { value: 'motivational', label: 'Motivational', desc: 'Energetic & uplifting' },
  { value: 'strong', label: 'Strong', desc: 'No-excuses, drill-sergeant' },
];

const DOWS = [
  { v: 0, l: 'Sun' }, { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' },
  { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' },
];

export default function NotificationsSettings() {
  const navigate = useNavigate();
  const { habits, refetch, updateHabit: updateHabitRow } = useHabits();
  const { prefs, update } = useNotificationPrefs();
  const { isPremium } = usePremium();

  const isNative = Capacitor.isNativePlatform();
  // Native app always supports notifications via FCM, regardless of what the
  // embedded WebView reports for the web Push API.
  const supported = isNative || isWebPushSupported();
  const [permission, setPermission] = useState<UnifiedPermission>('default');
  const [nativeTokenCount, setNativeTokenCount] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState<'idle' | 'enabling' | 'reregistering' | 'disabling'>('idle');
  const [streakSaverOn, setStreakSaverOn] = useState<boolean>(() => isStreakSaverEnabled());
  const [showChecklist, setShowChecklist] = useState(false);
  const [pendingHabitIds, setPendingHabitIds] = useState<Record<string, boolean>>({});
  const [draftReminderTimes, setDraftReminderTimes] = useState<Record<string, string>>({});
  const pendingHabitRef = useRef(new Set<string>());
  const [testSent, setTestSent] = useState(false);
  const [inAppFallback, setInAppFallback] = useState<boolean>(() => isInAppFallbackEnabled());
  const { user } = useAuth();
  const [emailPrefs, setEmailPrefsState] = useState(() => getEmailReminderPrefs());
  const [emailInput, setEmailInput] = useState<string>(() => getEmailReminderPrefs().email || '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sendingEmailTest, setSendingEmailTest] = useState(false);
  const settingsHelp = getNotificationSettingsHelp();



  // Re-read the actual permission + subscription from the platform
  const refreshStatus = useCallback(async () => {
    const snap = await getNotificationPermission();
    setPermission(snap.state);

    if (snap.isNative) {
      // On native the "subscription" equivalent is a registered FCM token row.
      setSubscription(null);
      if (user?.id) {
        const { data, error } = await supabase
          .from('device_tokens')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);
        if (error) console.warn('[notifPerm] device_tokens lookup failed', error.message);
        setNativeTokenCount(data?.length ?? 0);
        console.log('[notifPerm] FCM registration result: device_tokens rows =', data?.length ?? 0);
      }
      return;
    }

    if (!('serviceWorker' in navigator)) {
      setSubscription(null);
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = (await reg?.pushManager.getSubscription()) ?? null;
      setSubscription(sub);
      console.log('[notifPerm] web push subscription =', sub ? 'present' : 'none');
    } catch {
      setSubscription(null);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshStatus();
    // Re-check whenever the tab regains focus (user may have changed the OS/browser permission)
    const onVisible = () => { if (document.visibilityState === 'visible') refreshStatus(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshStatus]);


  // Prefill email input from auth user when nothing saved yet
  useEffect(() => {
    if (!emailInput && user?.email) setEmailInput(user.email);
  }, [user?.email, emailInput]);

  const persistEmailPrefs = (next: Parameters<typeof setEmailReminderPrefs>[0]) => {
    setEmailReminderPrefs(next);
    setEmailPrefsState(next);
  };

  const handleSendTestEmail = async () => {
    const parsed = emailReminderSchema.safeParse({ email: emailInput });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message || 'Invalid email');
      return;
    }
    if (!user?.email || parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
      setEmailError('Test emails can only be sent to your signed-in account email');
      return;
    }
    setEmailError(null);
    setSendingEmailTest(true);
    try {
      const { error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'habit-reminder-test',
          recipientEmail: parsed.data.email,
          idempotencyKey: `habit-reminder-test-${user?.id || 'anon'}-${Date.now()}`,
          templateData: { name: user?.user_metadata?.name || null },
        },
      });
      if (error) throw error;
      persistEmailPrefs({
        // Automatic email reminders do not have a server-side scheduler yet.
        // Keep the legacy preference disabled and record only the delivery test.
        enabled: false,
        email: parsed.data.email,
        verifiedAt: new Date().toISOString(),
      });
      toast.success(`Test email queued for ${parsed.data.email} 📧`);
    } catch (e) {
      console.error('[email-reminder] test send failed', e);
      toast.error('Could not queue the test email. Try again shortly.');
      persistEmailPrefs({ ...emailPrefs, enabled: false, email: parsed.data.email });
    } finally {
      setSendingEmailTest(false);
    }
  };

  const handleOpenSettings = async () => {
    if (settingsHelp.settingsUrl) {
      const ok = await copySettingsUrl(settingsHelp.settingsUrl);
      toast(ok ? 'Settings link copied — paste it in your address bar' : settingsHelp.settingsUrl, {
        duration: 6000,
      });
      // Attempt to open (most browsers block internal URLs, but try anyway)
      try { window.open(settingsHelp.settingsUrl, '_blank'); } catch { /* noop */ }
    } else {
      toast('Open your device Settings app to enable notifications', { duration: 5000 });
    }
  };

  const enablePush = async () => {
    setBusy('enabling');
    try {
      // Native: ask the OS (only when 'default'), then let useNativePush register FCM.
      if (isNative) {
        const snap = await requestNotificationPermission();
        await refreshStatus();
        if (snap.state === 'granted') toast.success('Notifications enabled 🔔');
        else if (snap.state === 'denied') {
          toast.error('Notifications are turned off for HabTastic in Android settings.');
        } else {
          toast.error('Permission not granted yet. Try again.');
        }
        return;
      }

      const ok = await ensurePushSubscription();
      await refreshStatus();
      const snap = await getNotificationPermission();
      if (ok) toast.success('Push notifications enabled 🔔');
      else if (snap.state === 'denied') {
        toast.error('Permission was blocked. Allow notifications in your browser settings, then try again.');
      } else {
        toast.error(lastPushFailure || 'Could not enable push. Try again in a moment.', { duration: 8000 });
      }

    } finally {
      setBusy('idle');
    }
  };


  // Drop the existing subscription and create a fresh one.
  // Useful when permission was just re-granted, the endpoint expired,
  // or the saved subscription is stale on the server.
  const reRegisterPush = async () => {
    setBusy('reregistering');
    try {
      await unsubscribePush();
      const ok = await ensurePushSubscription();
      await refreshStatus();
      if (ok) toast.success('Re-registered for push notifications ✅');
      else toast.error(lastPushFailure || 'Could not re-register. Check browser permissions.', { duration: 8000 });
    } finally {
      setBusy('idle');
    }
  };


  const disablePush = async () => {
    setBusy('disabling');
    try {
      await unsubscribePush();
      await refreshStatus();
      toast('Push notifications disabled');
    } finally {
      setBusy('idle');
    }
  };

  // Derived status flags for the UI
  const pushReady = isNative
    ? permission === 'granted' && (nativeTokenCount === null || nativeTokenCount > 0)
    : !!subscription;
  const expirationTime = subscription?.expirationTime ?? null;
  const expiresSoon = !!(expirationTime && expirationTime - Date.now() < 24 * 60 * 60 * 1000);
  const expired = !!(expirationTime && expirationTime < Date.now());
  const endpointOrigin = (() => {
    try { return subscription ? new URL(subscription.endpoint).hostname : null; } catch { return null; }
  })();

  // ── Platform / install detection (for blocked-permission help) ──
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /Android/i.test(ua);
  const isStandalone = typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
     (navigator as any).standalone === true);
  // iOS Safari only delivers web push to apps installed to the home screen
  const iosNeedsInstall = isIOS && !isStandalone && !isNative;

  const statusLabel = !supported
    ? (iosNeedsInstall ? 'Install this app to your Home Screen first' : 'Not supported in this browser')
    : permission === 'denied'
      ? (isNative ? 'Turned off in your device settings' : 'Blocked in browser settings')
      : expired
        ? 'Subscription expired — please re-register'
        : pushReady
          ? 'Active on this device'
          : permission === 'granted'
            ? (isNative ? 'Permission granted — registering this device…' : 'Permission granted, but not subscribed')
            : 'Off';


  const updateHabit = async (id: string, patch: { reminder_enabled?: boolean; reminder_time?: string | null; reminder_tone?: Tone }) => {
    if (pendingHabitRef.current.has(id)) return;
    pendingHabitRef.current.add(id);
    setPendingHabitIds(prev => ({ ...prev, [id]: true }));
    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          updateHabitRow(id, patch),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('habit_save_timeout')), 15_000);
          }),
        ]);
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      }
      if ('reminder_time' in patch) {
        setDraftReminderTimes(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      void refetch();
      if (patch.reminder_enabled === true) {
        setShowChecklist(true);
        if (!pushReady) {
          toast.info(permission === 'denied'
            ? 'Reminder saved. Push is blocked — see the setup checklist below to fix it or enable the in-app fallback.'
            : 'Reminder saved. Complete the setup checklist below to actually receive it.',
          { duration: 6000 });
        }
      }
    } catch (error) {
      console.error('[NotificationsSettings] habit reminder update failed', error);
      toast.error('Could not save reminder. Your changes are still here; retry.');
    } finally {
      pendingHabitRef.current.delete(id);
      setPendingHabitIds(prev => ({ ...prev, [id]: false }));
    }
  };

  if (!prefs) {
    return (
      <div className="min-h-screen pb-24 px-5 pt-14 bg-background flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-4" />
        <p className="text-caption text-muted-foreground">Loading notification preferences…</p>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <h1 className="text-h1 text-foreground mb-2">Notifications</h1>
      <p className="text-body text-muted-foreground mb-6">Smart reminders, comeback nudges, and weekly recaps.</p>

      <button
        type="button"
        onClick={() => navigate('/settings/notifications-setup')}
        className="inline-flex items-center gap-1.5 text-caption font-semibold text-primary hover:underline mb-6"
      >
        <ShieldAlert className="w-4 h-4" /> Troubleshoot notifications
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Push notification status */}
      <section className="glass rounded-card p-5 mb-6 shadow-card">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pushReady && !expired ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {pushReady && !expired ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body font-semibold text-foreground">Push notifications</p>
            <p className="text-caption text-muted-foreground truncate">{statusLabel}</p>
          </div>
        </div>

        {/* Detail rows */}
        <div className="rounded-btn bg-secondary/40 border border-border/30 divide-y divide-border/30 mb-3">
          <StatusRow label="Browser support" ok={supported} okText="Supported" failText="Not supported" />
          <StatusRow
            label="Permission"
            ok={permission === 'granted'}
            okText="Granted"
            failText={permission === 'denied' ? 'Denied' : 'Not requested yet'}
            warn={permission === 'default'}
          />
          <StatusRow
            label="Subscription"
            ok={pushReady && !expired}
            okText={expired ? 'Expired' : 'Active on this device'}
            failText={pushReady ? 'Expired' : 'No active subscription'}
            warn={expiresSoon && !expired}
          />
          {endpointOrigin && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-caption text-muted-foreground">Push service</span>
              <span className="text-caption font-medium text-foreground truncate max-w-[60%]">{endpointOrigin}</span>
            </div>
          )}
          {expirationTime && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-caption text-muted-foreground">Expires</span>
              <span className={`text-caption font-medium ${expired ? 'text-destructive' : expiresSoon ? 'text-warning' : 'text-foreground'}`}>
                {new Date(expirationTime).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* iOS-needs-installed-as-PWA helper */}
        {iosNeedsInstall && (
          <div className="rounded-btn bg-warning/10 border border-warning/30 p-3 mb-3 flex gap-2">
            <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="text-caption text-foreground">
              <p className="font-semibold mb-1">Install the app for notifications</p>
              <p className="text-muted-foreground">
                On iPhone, push notifications only work when the app is added to your Home Screen. Tap the <strong>Share</strong> icon in Safari, then <strong>Add to Home Screen</strong>, then open the app from your Home Screen and come back here to enable.
              </p>
            </div>
          </div>
        )}

        {/* Denied permission helper — platform aware, with one-click open */}
        {supported && permission === 'denied' && (
          <div className="rounded-btn bg-destructive/10 border border-destructive/30 p-3 mb-3">
            <div className="flex gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-caption text-foreground flex-1 min-w-0">
                <p className="font-semibold mb-1">Notifications are blocked on {settingsHelp.platform}</p>
                <ol className="text-muted-foreground list-decimal pl-4 space-y-0.5">
                  {settingsHelp.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={handleOpenSettings} className="gap-1.5">
                {settingsHelp.settingsUrl ? <Copy className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                {settingsHelp.settingsUrl ? 'Copy settings link' : 'Open device settings'}
              </Button>
              <Button size="sm" variant="ghost" onClick={refreshStatus} className="gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> I've allowed it — recheck
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Browsers don't allow apps to open their own internal settings page directly, so we copy the link for you to paste into the address bar.
            </p>
          </div>
        )}

        {/* Expired/needs re-register helper */}
        {supported && permission === 'granted' && (expired || (!pushReady && expirationTime !== null)) && (
          <div className="rounded-btn bg-warning/10 border border-warning/30 p-3 mb-3 flex gap-2">
            <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-caption text-foreground">
              Your subscription expired. Tap <strong>Re-register</strong> to start receiving notifications again.
            </p>
          </div>
        )}


        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!pushReady && (
            <Button
              size="sm"
              onClick={enablePush}
              disabled={!supported || permission === 'denied' || busy !== 'idle'}
            >
              {busy === 'enabling' ? 'Enabling…' : 'Enable'}
            </Button>
          )}
          {(pushReady || permission === 'granted') && (
            <Button
              size="sm"
              variant="outline"
              onClick={reRegisterPush}
              disabled={!supported || permission === 'denied' || busy !== 'idle'}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy === 'reregistering' ? 'animate-spin' : ''}`} />
              {busy === 'reregistering' ? 'Re-registering…' : 'Re-register'}
            </Button>
          )}
          {pushReady && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('send-test-push');
                  if (error) throw error;
                  if (data?.ok && data.sent > 0) toast.success(`Test sent to ${data.sent} device${data.sent > 1 ? 's' : ''} 📬`);
                  else toast.error(data?.message || 'No active subscription');
                } catch (e) {
                  toast.error('Failed to send test notification');
                  console.error(e);
                }
              }}
              disabled={busy !== 'idle'}
            >
              Send test
            </Button>
          )}
          {pushReady && (
            <Button
              size="sm"
              variant="ghost"
              onClick={disablePush}
              disabled={busy !== 'idle'}
              className="text-muted-foreground"
            >
              {busy === 'disabling' ? 'Disabling…' : 'Disable'}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshStatus}
            disabled={busy !== 'idle'}
            className="ml-auto text-muted-foreground gap-1.5"
            aria-label="Refresh push status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </section>

      {/* Reminder setup checklist (shown after enabling a reminder) */}
      {showChecklist && (
        <section className="glass rounded-card p-5 mb-6 shadow-card border-2 border-primary/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-h3 text-foreground">Reminder setup checklist</h3>
            </div>
            <button onClick={() => setShowChecklist(false)} className="text-muted-foreground hover:text-foreground" aria-label="Hide checklist">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          <p className="text-caption text-muted-foreground mb-3">
            Verify each step so your habit reminders actually land on this device.
          </p>
          <ol className="space-y-2">
            <ChecklistItem
              n={1}
              done={supported}
              title="Your browser supports notifications"
              desc={supported ? 'Web push is supported here.' : iosNeedsInstall ? 'On iPhone, add the app to your Home Screen first.' : 'This browser cannot receive push. Try Chrome, Edge, or Safari (iOS PWA).'}
            />
            <ChecklistItem
              n={2}
              done={permission === 'granted'}
              title="Notification permission granted"
              desc={permission === 'granted' ? 'Allowed.' : permission === 'denied' ? `Blocked on ${settingsHelp.platform}. Use "Open settings" to fix it in one click.` : 'Tap Enable in the Push card above to grant permission.'}
              action={
                permission === 'denied'
                  ? { label: settingsHelp.settingsUrl ? 'Copy settings link' : 'Open settings', onClick: handleOpenSettings }
                  : permission !== 'granted' && supported
                    ? { label: busy === 'enabling' ? 'Enabling…' : 'Enable', onClick: enablePush, disabled: busy !== 'idle' }
                    : undefined
              }
            />
            {permission === 'denied' && (
              <li className="rounded-btn bg-destructive/5 border border-destructive/20 p-3 text-caption text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Step-by-step for {settingsHelp.platform}:</p>
                <ol className="list-decimal pl-5 space-y-0.5">
                  {settingsHelp.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </li>
            )}
            <ChecklistItem
              n={3}
              done={pushReady && !expired}
              title="Active push subscription"
              desc={pushReady && !expired ? 'You\'re subscribed on this device.' : expired ? 'Subscription expired — re-register.' : 'No active subscription yet.'}
              action={permission === 'granted' && (!pushReady || expired) ? { label: busy === 'reregistering' ? 'Re-registering…' : 'Re-register', onClick: reRegisterPush, disabled: busy !== 'idle' } : undefined}
            />
            <ChecklistItem
              n={4}
              done={testSent}
              title="Send a test notification"
              desc={testSent ? 'Test sent — check your device.' : 'Confirm everything works end-to-end.'}
              action={pushReady ? {
                label: 'Send test',
                onClick: async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('send-test-push');
                    if (error) throw error;
                    if (data?.ok && data.sent > 0) {
                      setTestSent(true);
                      toast.success(`Test sent to ${data.sent} device${data.sent > 1 ? 's' : ''} 📬`);
                    } else toast.error(data?.message || 'No active subscription');
                  } catch { toast.error('Failed to send test notification'); }
                },
                disabled: busy !== 'idle',
              } : undefined}
            />
          </ol>
          {(!pushReady || permission === 'denied') && (
            <div className="mt-4 rounded-btn bg-primary/5 border border-primary/20 p-3 flex gap-2">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-caption text-foreground">
                Push isn't working? Turn on <strong>In-app reminders</strong> below as a backup — you'll get a banner inside the app at each reminder time.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Fallback reminders when push is unavailable */}
      <section className="glass rounded-card p-5 mb-6 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-h3 text-foreground">Fallback reminders</h3>
        </div>
        <p className="text-caption text-muted-foreground mb-3">
          Backup channels used when push notifications are blocked, unsupported, or off.
        </p>

        <div className="rounded-btn bg-secondary/30 border border-border/30 divide-y divide-border/30">
          <div className="flex items-center gap-3 p-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Bell className="w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium text-foreground">In-app reminders</p>
              <p className="text-caption text-muted-foreground">Show a banner inside the app at each reminder time when push is unavailable.</p>
            </div>
            <Switch
              checked={inAppFallback}
              onCheckedChange={(v) => {
                setInAppFallback(v);
                setInAppFallbackEnabled(v);
                toast.success(v ? 'In-app reminders enabled' : 'In-app reminders disabled');
              }}
            />
          </div>
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Mail className="w-[18px] h-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-body font-medium text-foreground">Email reminders</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold uppercase tracking-wide">Coming soon</span>
                </div>
                <p className="text-caption text-muted-foreground">
                  Automatic fallback emails are not active yet. You can test delivery to your signed-in account below.
                </p>
              </div>
              <Switch
                checked={false}
                disabled
                aria-label="Automatic email reminders are coming soon"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={(e) => { setEmailInput(e.target.value); setEmailError(null); }}
                className="h-9 bg-secondary border-border rounded-input text-caption flex-1"
                aria-invalid={!!emailError}
              />
              <Button
                size="sm"
                onClick={handleSendTestEmail}
                disabled={sendingEmailTest || !emailInput.trim()}
                className="shrink-0"
              >
                {sendingEmailTest ? 'Sending…' : emailPrefs.verifiedAt ? 'Resend test' : 'Send test'}
              </Button>
            </div>
            {emailError && (
              <p className="text-caption text-destructive">{emailError}</p>
            )}
            {emailPrefs.verifiedAt && emailPrefs.email && (
              <p className="text-[11px] text-muted-foreground">
                📨 Test queued for <strong>{emailPrefs.email}</strong> on {new Date(emailPrefs.verifiedAt).toLocaleDateString()}.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Keep push or in-app reminders enabled until automatic email reminders are released.
            </p>
          </div>
        </div>
      </section>



      {/* Default tone */}
      <section className="glass rounded-card p-5 mb-6 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-h3 text-foreground">Default tone</h3>
        </div>
        <p className="text-caption text-muted-foreground mb-3">Used for nudges that don't have a per-habit tone.</p>
        <div className="grid grid-cols-3 gap-2">
          {TONES.map(t => (
            <button
              key={t.value}
              onClick={() => update({ default_tone: t.value })}
              className={`py-2.5 px-2 rounded-btn text-caption font-semibold transition-all flex flex-col items-center ${prefs.default_tone === t.value ? 'gradient-primary text-white' : 'bg-secondary text-secondary-foreground'}`}
            >
              <span>{t.label}</span>
              <span className="text-[10px] opacity-80 normal-case font-medium">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Per-habit reminders */}
      <section className="glass rounded-card p-5 mb-6 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-h3 text-foreground">Per-habit reminders</h3>
          </div>
          <Switch checked={prefs.per_habit_enabled} onCheckedChange={(v) => update({ per_habit_enabled: v })} />
        </div>

        <ExactAlarmPrompt show={prefs.per_habit_enabled && habits.length > 0} />

        {!habits.length && (
          <p className="text-caption text-muted-foreground">Add a habit first to set up reminders.</p>
        )}

        <div className="space-y-2">
          {habits.map((h) => {
            const tone = (h as { reminder_tone?: Tone }).reminder_tone || prefs.default_tone;
            const enabled = (h as { reminder_enabled?: boolean }).reminder_enabled ?? true;
            return (
              <div key={h.id} className="rounded-btn bg-secondary/30 p-3 border border-border/30">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xl">{h.emoji}</span>
                  <p className="flex-1 text-body font-semibold text-foreground truncate">{h.name}</p>
                  <Switch
                    checked={enabled && prefs.per_habit_enabled}
                    disabled={!prefs.per_habit_enabled || !!pendingHabitIds[h.id]}
                    onCheckedChange={(v) => { void updateHabit(h.id, { reminder_enabled: v }); }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={draftReminderTimes[h.id] ?? h.reminder_time ?? ''}
                    onChange={(e) => setDraftReminderTimes(prev => ({ ...prev, [h.id]: e.target.value }))}
                    onBlur={() => {
                      if (h.id in draftReminderTimes) {
                        void updateHabit(h.id, { reminder_time: draftReminderTimes[h.id] || null });
                      }
                    }}
                    className="h-9 w-32 bg-secondary border-border rounded-input text-caption"
                    disabled={!enabled || !prefs.per_habit_enabled || !!pendingHabitIds[h.id]}
                  />
                  <select
                    value={tone}
                    onChange={(e) => { void updateHabit(h.id, { reminder_tone: e.target.value as Tone }); }}
                    className="h-9 px-2 rounded-btn bg-secondary text-foreground text-caption border border-border/30 flex-1"
                    disabled={!enabled || !prefs.per_habit_enabled || !!pendingHabitIds[h.id]}
                  >
                    {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </section>



      {/* Premium smart reminders. Preferences stay stored while locked so
          re-subscribing restores the exact setup the user had before expiry. */}
      <section className="glass rounded-card overflow-hidden mb-6 shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 bg-primary/5">
          <div>
            <p className="text-body font-semibold text-foreground">Smart reminders</p>
            {!isPremium && (
              <p className="text-caption text-muted-foreground">
                Your settings are saved. Premium unlocks them again instantly.
              </p>
            )}
          </div>
          <PremiumBadge />
        </div>
        <Row icon={<AlertTriangle className="w-[18px] h-[18px]" />} label="Missed habit follow-ups" desc="Gentle nudge 1h after the reminder + last-call at 21:00" checked={prefs.missed_followups_enabled} onChange={(v) => update({ missed_followups_enabled: v })} disabled={!isPremium} />
        <Row icon={<Heart className="w-[18px] h-[18px]" />} label="Comeback nudges" desc="Friendly check-ins after 1, 3, and 5+ inactive days" checked={prefs.comeback_enabled} onChange={(v) => update({ comeback_enabled: v })} disabled={!isPremium} />
        <Row icon={<Flame className="w-[18px] h-[18px]" />} label="Streak pressure alerts" desc="Heads-up at 19:00 when a 3+ day streak is at risk" checked={prefs.streak_pressure_enabled} onChange={(v) => update({ streak_pressure_enabled: v })} disabled={!isPremium} last />
        {!isPremium && (
          <button
            type="button"
            onClick={() => navigate('/pricing')}
            className="w-full px-4 py-3 text-xs font-semibold text-primary hover:bg-primary/5"
          >
            Unlock saved smart-reminder settings
          </button>
        )}
      </section>

      {/* Reward feedback remains available on Free. */}
      <section className="glass rounded-card overflow-hidden mb-6 shadow-card">
        <Row icon={<Award className="w-[18px] h-[18px]" />} label="Reward toasts" desc='In-app "+XP" and "Daily goal complete!" feedback' checked={prefs.reward_toasts_enabled} onChange={(v) => update({ reward_toasts_enabled: v })} last />
      </section>

      {/* Streak Saver */}
      <section className="glass rounded-card overflow-hidden mb-6 shadow-card">
        <Row
          icon={<Shield className="w-[18px] h-[18px]" />}
          label="Streak Saver"
          desc="Auto-protect your streak when you miss a single day · 2 saves per week, resets weekly"
          checked={streakSaverOn}
          onChange={(v) => {
            setStreakSaverOn(v);
            setStreakSaverEnabled(v);
            toast.success(v ? 'Streak Saver enabled' : 'Streak Saver disabled');
          }}
          last
        />
      </section>


      <section className="glass rounded-card p-5 mb-6 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-h3 text-foreground">Weekly recap</h3>
            <PremiumBadge />
          </div>
          <Switch
            checked={prefs.weekly_recap_enabled}
            onCheckedChange={(v) => update({ weekly_recap_enabled: v })}
            disabled={!isPremium}
          />
        </div>
        {!isPremium && (
          <button
            type="button"
            onClick={() => navigate('/pricing')}
            className="mb-3 text-caption font-semibold text-primary hover:underline"
          >
            Your recap schedule is saved — activate Premium to resume it.
          </button>
        )}
        {prefs.weekly_recap_enabled && (
          <div className="flex items-center gap-2">
            <select
              value={prefs.weekly_recap_dow}
              onChange={(e) => update({ weekly_recap_dow: parseInt(e.target.value, 10) })}
              className="h-9 px-2 rounded-btn bg-secondary text-foreground text-caption border border-border/30 flex-1"
              disabled={!isPremium}
            >
              {DOWS.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}
            </select>
            <Input
              type="time"
              value={prefs.weekly_recap_time}
              onChange={(e) => update({ weekly_recap_time: e.target.value })}
              className="h-9 w-32 bg-secondary border-border rounded-input text-caption"
              disabled={!isPremium}
            />
          </div>
        )}
      </section>

      {/* Quiet hours */}
      <section className="glass rounded-card p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Moon className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-h3 text-foreground">Quiet hours</h3>
          </div>
          <Switch checked={prefs.quiet_hours_enabled} onCheckedChange={(v) => update({ quiet_hours_enabled: v })} />
        </div>
        <p className="text-caption text-muted-foreground mb-3">Silence all notifications during this window.</p>
        {prefs.quiet_hours_enabled && (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-caption text-muted-foreground mb-1">From</p>
              <Input type="time" value={prefs.quiet_hours_start}
                onChange={(e) => update({ quiet_hours_start: e.target.value })}
                className="h-9 bg-secondary border-border rounded-input" />
            </div>
            <div className="flex-1">
              <p className="text-caption text-muted-foreground mb-1">To</p>
              <Input type="time" value={prefs.quiet_hours_end}
                onChange={(e) => update({ quiet_hours_end: e.target.value })}
                className="h-9 bg-secondary border-border rounded-input" />
            </div>
          </div>
        )}
      </section>
    </motion.div>
  );
}

function Row({ icon, label, desc, checked, onChange, last, disabled = false }: {
  icon: React.ReactNode; label: string; desc: string; checked: boolean;
  onChange: (v: boolean) => void; last?: boolean; disabled?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 p-4 ${last ? '' : 'border-b border-border/40'}`}>
      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <div className="flex-1">
        <p className="text-body font-medium text-foreground">{label}</p>
        <p className="text-caption text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function StatusRow({ label, ok, okText, failText, warn }: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
  warn?: boolean;
}) {
  const tone = warn ? 'warn' : ok ? 'ok' : 'fail';
  const Icon = tone === 'ok' ? Check : tone === 'warn' ? Info : XIcon;
  const colorClass =
    tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-destructive';
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 text-caption font-medium ${colorClass}`}>
        <Icon className="w-3.5 h-3.5" />
        {ok ? okText : failText}
      </span>
    </div>
  );
}

function ChecklistItem({ n, done, title, desc, action }: {
  n: number;
  done: boolean;
  title: string;
  desc: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <li className="flex items-start gap-3 rounded-btn bg-secondary/30 border border-border/30 p-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-caption font-bold ${done ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
        {done ? <Check className="w-4 h-4" /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body font-semibold text-foreground">{title}</p>
        <p className="text-caption text-muted-foreground">{desc}</p>
      </div>
      {action && (
        <Button size="sm" onClick={action.onClick} disabled={action.disabled} className="shrink-0">
          {action.label}
        </Button>
      )}
    </li>
  );
}
