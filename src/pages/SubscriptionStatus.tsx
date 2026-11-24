import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, CreditCard, Calendar, AlertCircle, CheckCircle2, XCircle,
  Sparkles, RotateCw, ShieldCheck, ChevronDown, ChevronUp, Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useGooglePlayBilling } from '@/hooks/useGooglePlayBilling';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { playManageUrl } from '@/lib/subscriptionGuard';
import { readVerificationRecord, resolveVerificationNotice } from '@/lib/purchaseVerification';
import { normalizePlanInterval, shortPlanNameFor } from '@/lib/planInterval';
import { PurchaseVerificationNotice, RestorePurchasesGuide } from '@/components/subscription/PurchaseVerificationHelp';

interface AuditRow {
  id: string;
  event_type: string;
  changed_fields: Record<string, unknown> & { outcome?: string };
  created_at: string;
}

interface SubRow {
  id: string;
  provider: string;
  plan_interval: string;
  plan_code: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_date: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  paystack_subscription_code: string | null;
  environment: string;
  updated_at: string;
}

const STATUS_META: Record<string, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  active:       { label: 'Active',          tone: 'text-success',    icon: CheckCircle2 },
  trialing:     { label: 'On free trial',   tone: 'text-primary',    icon: Sparkles },
  'non-renewing': { label: 'Cancels at period end', tone: 'text-warning', icon: AlertCircle },
  attention:    { label: 'Payment failed',  tone: 'text-destructive', icon: AlertCircle },
  canceled:     { label: 'Canceled',        tone: 'text-muted-foreground', icon: XCircle },
  expired:      { label: 'Expired',         tone: 'text-muted-foreground', icon: XCircle },
  inactive:     { label: 'Inactive',        tone: 'text-muted-foreground', icon: XCircle },
  pending:      { label: 'Pending',         tone: 'text-muted-foreground', icon: RotateCw },
  refunded:     { label: 'Refunded',        tone: 'text-muted-foreground', icon: XCircle },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(amount: number | null, currency: string | null) {
  if (!amount || !currency) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount / 100);
}

export default function SubscriptionStatus() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const play = useGooglePlayBilling();
  const [sub, setSub] = useState<SubRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);

  const loadAudit = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('paystack_subscription_audit')
      .select('id, event_type, changed_fields, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setAudit((data as unknown as AuditRow[] | null) ?? []);
  };

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error(error);
      toast.error('Could not load subscription');
    }
    setSub((data as unknown as SubRow | null) ?? null);
    setLoading(false);
    if (!play.isPlay && data?.provider !== 'google_play') void loadAudit();
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  // Realtime: reflect webhook-driven subscription updates instantly, even if
  // the client-side verify call was interrupted (lost network, app closed).
  useEffect(() => {
    if (!user?.id) return;
    let realtimeHealthy = false;
    // Unique per-mount channel name so StrictMode double-mount (or a
    // remount after fast nav) never re-attaches .on() to an already
    // subscribed channel — that combination throws
    // "cannot add postgres_changes callbacks after subscribe()".
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(`sub-status-${user.id}-${Math.random().toString(36).slice(2)}`);
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
          () => { load(); },
        )
        .subscribe((status) => {
          realtimeHealthy = status === 'SUBSCRIBED';
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[SubscriptionStatus] realtime status:', status);
          }
        });
    } catch (err) {
      // Realtime failure must never crash the page — polling below covers us.
      console.warn('[SubscriptionStatus] realtime setup failed:', err);
    }

    // Polling fallback: re-fetch periodically in case realtime is briefly
    // unavailable (websocket drop, proxy issue, backgrounded tab). Skips when
    // the tab is hidden to avoid wasted requests.
    const POLL_HEALTHY_MS = 60_000;   // realtime working: gentle safety net
    const POLL_DEGRADED_MS = 15_000;  // realtime down: tighter loop
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load();
    }, POLL_HEALTHY_MS);

    // Extra catch-up tick when the user returns to the tab.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Faster polling whenever realtime hasn't reached SUBSCRIBED.
    const degradedInterval = window.setInterval(() => {
      if (realtimeHealthy) return;
      if (document.visibilityState !== 'visible') return;
      load();
    }, POLL_DEGRADED_MS);

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
      }
      window.clearInterval(interval);
      window.clearInterval(degradedInterval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast.success('Refreshed');
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      if (play.isPlay) {
        await play.restore();
        await load();
        return;
      }
      if (sub?.provider === 'google_play') {
        await load();
        toast.success('Subscription refreshed');
        return;
      }
      // Force-fetch state from Paystack and update premium on demand.
      // Also covers the "webhook never fired after checkout" edge case
      // without needing a transaction reference.
      const { data, error } = await supabase.functions.invoke(
        'paystack-sync-subscription',
        { body: {} },
      );
      if (error) throw error;
      await load();
      const d = data;
      if (d?.premium) {
        toast.success(d?.duplicate ? 'Already up to date' : 'Subscription status confirmed');
      } else if (d?.status === 'no_customer' || d?.status === 'no_subscription') {
        toast.info('No active subscription found on Paystack');
      } else {
        toast.success('Subscription refreshed');
      }
    } catch (e) {
      console.error(e);
      toast.error('Could not check subscription status');
    } finally {
      setChecking(false);
    }
  };

  const handleCancel = async () => {
    // Choose the management path by where the subscription was bought, not by device.
    if (!sub || sub.provider === 'google_play') {
      if (play.isPlay) { await play.manage(); return; }
      window.open(playManageUrl(sub?.plan_code), '_blank', 'noopener,noreferrer');
      return;
    }
    if (!confirm("Cancel subscription? You'll keep Premium until the end of the current period.")) return;
    setCanceling(true);
    try {
      const { error } = await supabase.functions.invoke('paystack-cancel');
      if (error) throw error;
      window.__lovableEvents?.track?.('project.subscription_cancelled', { provider: 'paystack', source: 'subscription_status' });
      toast.success('Subscription canceled');
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Could not cancel subscription');
    } finally {
      setCanceling(false);
    }
  };

  const periodEndMs = sub?.current_period_end ? Date.parse(sub.current_period_end) : NaN;
  const periodExpired = Number.isFinite(periodEndMs) && periodEndMs <= Date.now();
  const legacyCanceledStillPaid = sub?.status === 'canceled' && !!sub.cancel_at_period_end && Number.isFinite(periodEndMs) && periodEndMs > Date.now();
  const effectiveStatus = periodExpired && ['active', 'non-renewing', 'attention', 'canceled'].includes(sub?.status ?? '')
    ? 'expired'
    : legacyCanceledStillPaid ? 'non-renewing' : sub?.status;
  const meta = effectiveStatus ? (STATUS_META[effectiveStatus] ?? STATUS_META.pending) : null;
  const StatusIcon = meta?.icon ?? CreditCard;
  const isActiveLike = !!sub && ['active', 'trialing', 'non-renewing', 'attention'].includes(effectiveStatus ?? '');
  const isPlaySubscription = sub?.provider === 'google_play';
  // Google Play actions only for Google Play subscriptions (or Android users with none yet).
  const usesPlayActions = isPlaySubscription || (play.isPlay && !sub);
  const checkLabel = play.isPlay ? 'Restore Google Play purchases' : isPlaySubscription ? 'Refresh subscription status' : 'Check subscription status';
  const checkingLabel = play.isPlay ? 'Restoring purchases…' : isPlaySubscription ? 'Refreshing…' : 'Checking Paystack…';
  // RTDN amounts and Paystack amounts use different units. For Play, display
  // the localized product price supplied by Google instead of dividing by 100.
  const playPrice = normalizePlanInterval(sub?.plan_interval) === 'yearly' ? play.prices.yearly : play.prices.monthly;
  // Re-read on every render so a restore/refresh that clears the record hides the notice.
  const notice = !loading && user ? resolveVerificationNotice(readVerificationRecord(user.id), sub) : null;

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/profile'))}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-h1 text-foreground">Subscription</h1>
      </div>

      {notice && <PurchaseVerificationNotice notice={notice} />}

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !sub ? (
        <div className="glass rounded-card p-6 shadow-card text-center">
          <p className="text-foreground/90 mb-4">You don't have an active subscription.</p>
          <Button onClick={() => navigate('/pricing')} className="w-full">
            <Sparkles className="w-4 h-4 mr-2" /> See plans
          </Button>
          <Button variant="outline" onClick={handleCheckStatus} className="w-full mt-2" disabled={checking}>
            <ShieldCheck className={`w-4 h-4 mr-2 ${checking ? 'animate-pulse' : ''}`} />
            {checking ? checkingLabel : checkLabel}
          </Button>
          {play.isPlay && (
            <Button variant="outline" onClick={handleCancel} className="w-full mt-2">
              Manage subscription in Google Play
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="glass rounded-card p-5 shadow-card mb-4">
            <div className="flex items-center gap-3 mb-4">
              <StatusIcon className={`w-6 h-6 ${meta?.tone}`} />
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={`font-semibold ${meta?.tone}`}>{meta?.label}</p>
              </div>
            </div>

            <Row label="Plan" value={shortPlanNameFor(sub.plan_interval)} />
            <Row label="Billing provider" value={isPlaySubscription ? 'Google Play' : play.isPlay ? 'Website' : 'Paystack'} />
            {(isPlaySubscription || !play.isPlay) && (
              <Row label={isPlaySubscription ? 'Current plan price' : 'Price'} value={isPlaySubscription ? playPrice?.priceString ?? 'See Google Play' : formatAmount(sub.amount, sub.currency)} />
            )}
            <Row label="Started" value={formatDate(sub.current_period_start)} />
            <Row
              label="Next billing"
              value={
                effectiveStatus === 'expired'
                  ? `Expired ${formatDate(sub.current_period_end)}`
                  : (sub.cancel_at_period_end || effectiveStatus === 'non-renewing')
                    ? `Ends ${formatDate(sub.current_period_end)}`
                    : formatDate(sub.next_payment_date ?? sub.current_period_end)
              }
              icon={Calendar}
            />
            {sub.canceled_at && (
              <Row label="Canceled on" value={formatDate(sub.canceled_at)} />
            )}
            <Row label="Environment" value={sub.environment} mono />
            {sub.paystack_subscription_code && !play.isPlay && (
              <Row label="Subscription ref" value={sub.paystack_subscription_code} mono />
            )}
          </div>

          {sub.status === 'attention' && (
            <div className="rounded-card bg-destructive/10 border border-destructive/30 p-4 mb-4 text-sm text-destructive">
              {isPlaySubscription
                ? 'There is a payment problem. Manage your payment method in Google Play.'
                : 'The payment provider reported a payment problem. Refresh your subscription status to check for updates.'}
            </div>
          )}

          {play.isPlay && !isPlaySubscription && (
            <p className="text-sm text-muted-foreground mb-4">
              This existing subscription was purchased on the website, so it can't be changed here. Premium works on all your devices.
            </p>
          )}

          <div className="space-y-2">
            <Button onClick={handleCheckStatus} disabled={checking} className="w-full">
              <ShieldCheck className={`w-4 h-4 mr-2 ${checking ? 'animate-pulse' : ''}`} />
              {checking ? checkingLabel : checkLabel}
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="w-full">
              <RotateCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} /> Refresh local view
            </Button>
            {(usesPlayActions || (!play.isPlay && isActiveLike && !sub.cancel_at_period_end)) && (
              <Button variant={usesPlayActions ? 'outline' : 'destructive'} onClick={handleCancel} disabled={canceling} className="w-full">
                {usesPlayActions ? 'Manage subscription in Google Play' : canceling ? 'Canceling…' : 'Cancel subscription'}
              </Button>
            )}
            {!isActiveLike && (
              <Button onClick={() => navigate('/pricing')} className="w-full">
                <Sparkles className="w-4 h-4 mr-2" /> Resubscribe
              </Button>
            )}
          </div>
        </>
      )}

      {!loading && (
        <RestorePurchasesGuide isPlay={play.isPlay} restoreLabel={checkLabel} defaultOpen={!!notice || !sub} />
      )}

      {/* Sync audit log: every Paystack sync attempt (webhook + manual) shows
          up here so users and support can debug premium activation issues. */}
      {!usesPlayActions && !play.isPlay && <div className="mt-6">
        <button
          onClick={() => setAuditOpen((v) => !v)}
          className="w-full flex items-center justify-between glass rounded-card px-4 py-3 shadow-card"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Activity className="w-4 h-4 text-primary" />
            Sync history {audit.length > 0 && (
              <span className="text-[11px] text-muted-foreground">({audit.length})</span>
            )}
          </span>
          {auditOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {auditOpen && (
          <div className="mt-2 space-y-2">
            {audit.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-2">
                No sync attempts recorded yet.
              </p>
            ) : audit.map((row) => {
              const outcome = (row.changed_fields?.outcome as string) ?? 'updated';
              const ok = /synced|active|updated|received|processed/.test(outcome);
              const isErr = /error|failed/.test(outcome);
              return (
                <div key={row.id} className="glass rounded-card p-3 shadow-card">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-foreground truncate">
                      {row.event_type}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      isErr ? 'bg-destructive/15 text-destructive'
                        : ok ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}>{outcome}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                  <details className="mt-1">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer">
                      Details
                    </summary>
                    <pre className="text-[10px] text-muted-foreground font-mono mt-1 break-all whitespace-pre-wrap max-h-32 overflow-auto">
                      {JSON.stringify(row.changed_fields, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>}
    </motion.div>
  );
}

function Row({ label, value, mono, icon: Icon }: { label: string; value: string; mono?: boolean; icon?: typeof Calendar }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </span>
      <span className={`text-sm text-foreground ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
