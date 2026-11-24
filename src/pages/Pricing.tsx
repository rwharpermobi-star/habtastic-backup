import { useEffect, useState } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Crown, Check, ChevronLeft, Shield, Loader2, Sparkles, Star, Bot, BarChart3,
  Zap, Bell, Palette, Cloud, Ban, Users, Trophy,
  Flame, Calendar, X, Brain, Lock, Gift, Rocket, Heart,
  type LucideIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { usePremium } from '@/hooks/usePremium';
import { useReferral } from '@/hooks/useReferral';
import { readPremiumCache, writePremiumCache } from '@/lib/premiumCache';
import { toast } from 'sonner';
import UpgradeConfirmModal, { type UpgradePlan } from '@/components/UpgradeConfirmModal';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import InviteEarnCard from '@/components/InviteEarnCard';
import { useUsdToZarRate } from '@/hooks/useExchangeRate';
import { playManageUrl } from '@/lib/subscriptionGuard';
import { usePaystackCheckout } from '@/hooks/usePaystackCheckout';
import PublicFooter from '@/components/PublicFooter';
import { useAuth } from '@/contexts/AuthContext';
import { PaymentDunningBanner } from '@/components/PaymentDunningBanner';
import { usePricingPlans } from '@/hooks/usePricingPlans';
import { useGooglePlayBilling } from '@/hooks/useGooglePlayBilling';
import { ADMIN_EMAIL } from '@/lib/contactEmails';
import { intervalSuffixFor, normalizePlanInterval, planLabelFor } from '@/lib/planInterval';
import {
  PREMIUM_PREVIEWS,
  premiumPreviewState,
  type PremiumPreview,
  type PremiumPreviewId,
  type PremiumPreviewState,
  PREMIUM_PREVIEW_INCLUDED_LABEL,
} from '@/lib/premiumPreviews';

type SelectedPlan = 'monthly' | 'yearly';

// Currency symbol map — Paystack currencies we actually support.
const CURRENCY_SYMBOL: Record<string, string> = { ZAR: 'R', USD: '$', NGN: '₦', GHS: 'GH₵', KES: 'KSh' };
const formatMoney = (amount: number, currency: string) =>
  `${CURRENCY_SYMBOL[currency] ?? `${currency} `}${amount.toFixed(2)}`;
const formatUsd = (n: number) => `~$${n.toFixed(2)}`;

// ---- Comparison data --------------------------------------------------------
type Row = { label: string; free: string | boolean; premium: string | boolean };
type Section = { title: string; icon; rows: Row[] };

const SECTIONS: Section[] = [
  {
    title: 'Habits & Winston AI',
    icon: Bot,
    rows: [
      { label: 'Active habits', free: 'Up to 4', premium: 'Unlimited' },
      { label: 'Winston AI messages', free: '5 / day', premium: 'Unlimited' },
      { label: 'Personalised AI coaching', free: false, premium: true },
      { label: 'Weekly AI reviews & insights', free: false, premium: true },
    ],
  },
  {
    title: 'Analytics & Community',
    icon: BarChart3,
    rows: [
      { label: 'Basic analytics', free: true, premium: true },
      { label: 'Advanced analytics & reports', free: false, premium: true },
      { label: 'Community & leaderboards', free: true, premium: true },
      { label: 'Premium challenges & rewards', free: false, premium: true },
    ],
  },
  {
    title: 'Cosmetics & Experience',
    icon: Palette,
    rows: [
      { label: 'Daily rewards & chests', free: true, premium: true },
      { label: 'Standard reminders', free: true, premium: true },
      { label: 'Smart reminders', free: false, premium: true },
      { label: 'Premium cosmetics & themes', free: false, premium: true },
      { label: 'Personal Google Drive backup & sync', free: true, premium: true },
      { label: 'Ad-free & early access', free: false, premium: true },
    ],
  },
];

function Cell({ v, accent }: { v: string | boolean; accent?: boolean }) {
  if (v === true) {
    return (
      <span className={`inline-flex w-5 h-5 rounded-full items-center justify-center ${accent ? 'bg-primary/20 shadow-[0_0_8px_hsl(var(--primary)/0.4)]' : 'bg-success/15'}`}>
        <Check className={`w-3 h-3 ${accent ? 'text-primary' : 'text-success'}`} />
      </span>
    );
  }
  if (v === false) return <X className="w-4 h-4 text-muted-foreground/50" />;
  return <span className={`text-[11px] font-semibold ${accent ? 'text-primary' : 'text-foreground'}`}>{v}</span>;
}

// ---- Benefit + Preview + Testimonial sub-components -------------------------
function BenefitCard({ emoji, title, body, delay = 0 }: { emoji: string; title: string; body: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -2 }}
      className="rounded-card border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0">
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-body text-foreground leading-tight">{title}</p>
          <p className="text-caption text-muted-foreground mt-1 leading-relaxed">{body}</p>
        </div>
      </div>
    </motion.div>
  );
}

const PREVIEW_ICONS: Record<PremiumPreviewId, LucideIcon> = {
  'avatar-drops': Palette,
  'exclusive-themes': Sparkles,
  'premium-badges': Crown,
  'ai-weekly-reports': BarChart3,
  'leaderboard-rewards': Trophy,
  'bonus-chest-loot': Gift,
};

function PremiumPreviewCard({ preview, state, onOpen }: {
  preview: PremiumPreview;
  state: PremiumPreviewState;
  onOpen: (route: string) => void;
}) {
  const Icon = PREVIEW_ICONS[preview.id];
  const unlocked = state === 'unlocked';
  const body = (
    <>
      {!unlocked && <div className="absolute inset-0 backdrop-blur-[2px] bg-background/20 pointer-events-none" />}
      <div className="relative flex flex-col items-center text-center gap-2">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${unlocked ? 'bg-success/15' : 'bg-primary/15'}`}>
          <Icon className={`w-5 h-5 ${unlocked ? 'text-success' : 'text-primary'}`} />
        </div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-primary">{preview.tag}</p>
        <p className="text-caption font-semibold text-foreground leading-tight">{preview.title}</p>
        {state === 'loading' && (
          <span data-testid="preview-status" className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-foreground/5 text-[10px] font-semibold text-muted-foreground">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> Checking…
          </span>
        )}
        {state === 'locked' && (
          <span data-testid="preview-status" className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-foreground/10 text-[10px] font-semibold text-foreground">
            <Lock className="w-2.5 h-2.5" /> Premium
          </span>
        )}
        {unlocked && (
          <span data-testid="preview-status" className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-success/15 text-[10px] font-semibold text-success">
            <Check className="w-2.5 h-2.5" strokeWidth={3} /> {PREMIUM_PREVIEW_INCLUDED_LABEL}
          </span>
        )}
      </div>
    </>
  );
  const className = `relative rounded-card border p-4 overflow-hidden w-full ${
    unlocked
      ? 'border-success/30 bg-gradient-to-br from-success/10 to-card text-left transition-transform active:scale-[0.98]'
      : 'border-border bg-gradient-to-br from-secondary/40 to-card'
  }`;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
      {unlocked && preview.route ? (
        <button
          type="button"
          data-testid={`premium-preview-${preview.id}`}
          data-state={state}
          aria-label={`Open ${preview.title}`}
          onClick={() => onOpen(preview.route!)}
          className={className}
        >
          {body}
        </button>
      ) : (
        <div
          data-testid={`premium-preview-${preview.id}`}
          data-state={state}
          aria-busy={state === 'loading' || undefined}
          className={className}
        >
          {body}
        </div>
      )}
    </motion.div>
  );
}

function Testimonial({ quote, name }: { quote: string; name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="rounded-card border border-border bg-card p-4"
    >
      <div className="flex items-center gap-0.5 mb-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="w-3.5 h-3.5 text-warning" fill="currentColor" />
        ))}
      </div>
      <p className="text-caption text-foreground italic leading-relaxed">"{quote}"</p>
      <p className="text-[10px] text-muted-foreground mt-2 font-semibold">— {name}</p>
    </motion.div>
  );
}

// ---- Floating glow particles (hero ambience) --------------------------------
function FloatingParticles({ count = 10, reduced }: { count?: number; reduced?: boolean }) {
  if (reduced) return null;
  // Deterministic pseudo-random layout so particles don't jump on re-render
  const particles = Array.from({ length: count }).map((_, i) => {
    const seed = (i + 1) * 37;
    const left = (seed * 13) % 100;
    const top = (seed * 29) % 100;
    const size = 4 + ((seed * 7) % 8);
    const duration = 6 + ((seed * 3) % 6);
    const delay = (seed % 30) / 10;
    const drift = 10 + ((seed * 5) % 20);
    const hue = i % 2 === 0 ? 'var(--primary)' : 'var(--accent)';
    return { id: i, left, top, size, duration, delay, drift, hue };
  });
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle, hsl(${p.hue} / 0.9) 0%, hsl(${p.hue} / 0) 70%)`,
            filter: 'blur(0.5px)',
            willChange: 'transform, opacity',
          }}
          animate={{
            y: [0, -p.drift, 0],
            x: [0, p.drift / 2, 0],
            opacity: [0, 0.9, 0],
            scale: [0.6, 1.1, 0.6],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export default function Pricing() {
  usePageMeta({
    title: 'HabTastic AI Pricing — Free & Premium Plans',
    description: 'Compare HabTastic AI Free and Premium plans: up to 4 habits and 5 Winston messages daily on Free, with unlimited habits and Winston coaching on Premium.',
    canonicalPath: '/pricing',
  });

  const navigate = useNavigate();
  const { user, checkSubscription } = useAuth();
  const queryClient = useQueryClient();
  const { isPremium, isPaidPremium, entitlementLoading, nextBillingDate } = usePremium();
  // Signed-out visitors (public /pricing) always see the locked previews.
  const previewState = premiumPreviewState({ entitlementLoading, isPaidPremium: !!user && isPaidPremium });
  // Never show buy/plan UI to a member whose Premium is still being confirmed.
  const showUpsell = !entitlementLoading && !isPaidPremium;
  const { paidReferralCount, MILESTONES } = useReferral();
  const [selected, setSelected] = useState<SelectedPlan>('yearly');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const { rate: usdToZar } = useUsdToZarRate();
  const { startCheckout } = usePaystackCheckout();
  const { plans: pricing, loading: pricingLoading, error: pricingError } = usePricingPlans();
  // Native Android must use Google Play Billing (Play policy). Web is untouched.
  const play = useGooglePlayBilling();
  const monthlyAmount = play.isPlay && play.prices.monthly ? play.prices.monthly.price : pricing.monthly.amount;
  const yearlyAmount = play.isPlay && play.prices.yearly ? play.prices.yearly.price : pricing.yearly.amount;
  const currency = play.isPlay && play.prices.monthly ? play.prices.monthly.currencyCode : pricing.monthly.currency;
  // Prefer the localized Play Store price string on Android.
  const priceFor = (plan: SelectedPlan) =>
    play.isPlay
      ? (play.prices[plan]?.priceString ?? 'Price unavailable')
      : formatMoney(plan === 'monthly' ? monthlyAmount : yearlyAmount, currency);
  const formatMonthly = () => play.isPlay && !play.prices.monthly ? 'Price unavailable' : `${priceFor('monthly')}/mo`;
  const formatYearly = () => play.isPlay && !play.prices.yearly ? 'Price unavailable' : `${priceFor('yearly')}/yr`;
  const yearlySavingsPct = Math.max(0, Math.round((1 - yearlyAmount / (monthlyAmount * 12)) * 100));
  const PRICE_LABEL: Record<SelectedPlan, string> = {
    monthly: formatMonthly(),
    yearly: formatYearly(),
  };
  const reducedMotion = useReducedMotion();

  // Active-subscription snapshot for the "Premium Active" billing card.
  const [activeSub, setActiveSub] = useState<{
    provider: string | null;
    plan_interval: string | null;
    amount: number | null;
    currency: string | null;
    current_period_end: string | null;
    next_payment_date: string | null;
    cancel_at_period_end: boolean | null;
  } | null>(null);
  useEffect(() => {
    if (!user || !isPaidPremium) { setActiveSub(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('provider, plan_interval, amount, currency, current_period_end, next_payment_date, cancel_at_period_end')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setActiveSub((data) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, isPaidPremium]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_premium, premium_until')
        .eq('user_id', user.id)
        .single();
      if (cancelled || !data) return;
      const cached = readPremiumCache(user.id);
      const changed =
        !cached ||
        cached.isPremium !== !!data.is_premium ||
        (cached.premiumUntil ?? null) !== (data.premium_until ?? null);
      if (!changed) return;
      writePremiumCache(user.id, data);
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
    })();
    return () => { cancelled = true; };
  }, [user, queryClient]);

  const usd = (zar: number) => zar / Math.max(usdToZar, 1);

  const openConfirm = (plan: SelectedPlan) => {
    if (play.isPlay && (!play.supported || !play.prices[plan])) {
      toast.error('Google Play pricing is unavailable. Please try again later.');
      return;
    }
    setSelected(plan);
    setConfirmOpen(true);
  };

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        toast.error('Please sign in to upgrade.');
        navigate('/auth');
        return;
      }
      // Native Android: Google Play Billing only — never an external checkout.
      if (play.isPlay) {
        if (!play.supported || !play.prices[selected]) {
          toast.error('Google Play pricing is unavailable. Please try again later.');
          return;
        }
        const ok = await play.purchase(selected);
        if (ok) setConfirmOpen(false);
        return;
      }
      await startCheckout(selected);
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    // Manage by where the subscription was bought, not by device.
    if (activeSub?.provider === 'google_play' || (play.isPlay && !activeSub)) {
      if (play.isPlay) { await play.manage(); return; }
      window.open(playManageUrl(), '_blank', 'noopener,noreferrer');
      return;
    }
    try {
      const { error } = await supabase.functions.invoke('paystack-cancel');
      if (error) {
        toast.error(`Could not cancel subscription. Contact ${ADMIN_EMAIL} if this persists.`);
        return;
      }
      window.__lovableEvents?.track?.('project.subscription_cancelled', { provider: 'paystack', source: 'pricing' });
      toast.success("Subscription canceled. You'll keep Premium until the period ends.");
      await checkSubscription();
    } catch (e) {
      console.error(e);
      toast.error('Could not cancel subscription.');
    }
  };

  const handleRestore = async () => {
    if (play.isPlay) {
      await play.restore();
      return;
    }
    setRestoring(true);
    try {
      await checkSubscription();
      toast.success('Account synced. Premium status is up to date.');
    } catch (e) {
      toast.error(`Could not sync. Try again or contact ${ADMIN_EMAIL}.`);
    } finally {
      setRestoring(false);
    }
  };

  const refTiers = MILESTONES.map(({ count, label }) => ({ count, reward: label }));
  const nextTier = refTiers.find(t => paidReferralCount < t.count) ?? null;
  const refProgress = nextTier ? Math.min(100, (paidReferralCount / nextTier.count) * 100) : 100;

  return (
    <div className="min-h-screen pb-24 bg-background">
      <PaymentDunningBanner />
      <div className="px-5 pt-14">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="p-2 rounded-full hover:bg-secondary/50 transition-colors">
            <ChevronLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
          </button>
          <h1 className="text-h1 text-foreground font-display">Premium</h1>
        </div>

        {/* ─── HERO CARD ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mb-8 rounded-card overflow-hidden border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-accent/15 p-6 shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.4)]"
        >
          {/* Ambient glow */}
          <motion.div
            aria-hidden
            className="absolute -top-10 -right-10 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.35) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.3, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="absolute -bottom-14 -left-10 w-44 h-44 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, hsl(var(--accent) / 0.3) 0%, transparent 70%)' }}
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Floating glow particles */}
          <FloatingParticles count={12} reduced={!!reducedMotion} />

          <div className="relative text-center">
            <motion.div
              className="relative w-20 h-20 mx-auto mb-4"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center"
                style={{
                  background: 'radial-gradient(circle at 30% 30%, #E6C460 0%, #D4AF37 45%, #8B6914 100%)',
                  boxShadow: '0 0 32px rgba(212,175,55,0.6), inset 0 2px 8px rgba(255,255,255,0.4)',
                }}
              >
                <Crown className="w-10 h-10 text-white drop-shadow" />
              </div>
            </motion.div>

            <h2 className="font-display font-extrabold text-foreground text-3xl leading-tight">
              Become the <span className="text-gradient-gold">Best Version</span> of Yourself
            </h2>

            {/* Live headline price — always visible under heading */}
            <div className="mt-3 flex items-center justify-center min-h-[28px]">
              {pricingLoading ? (
                <div className="h-6 w-40 rounded-full bg-foreground/10 animate-pulse" />
              ) : pricingError ? (
                <p className="text-caption text-muted-foreground">Unable to load pricing — showing standard rate</p>
              ) : (
                <p className="text-body font-semibold text-foreground">
                  From{' '}
                  <span className="font-display font-extrabold text-primary text-lg">
                    {formatMoney(monthlyAmount, currency)}
                  </span>
                  <span className="text-caption text-muted-foreground">/month</span>
                  <span className="text-muted-foreground mx-1.5">·</span>
                  <span className="text-caption">
                    Yearly {formatMoney(yearlyAmount / 12, currency)}/mo
                  </span>
                </p>
              )}
            </div>

            {/* Benefit chips — replace long paragraph with scannable icons */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 max-w-sm mx-auto">
              {[
                { icon: Bot, label: 'Unlimited AI' },
                { icon: BarChart3, label: 'Smart Insights' },
                { icon: Palette, label: 'Exclusive Cosmetics' },
                { icon: Bell, label: 'Smart Reminders' },
                { icon: Ban, label: 'Ad‑free' },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-foreground/5 border border-primary/20 text-[11px] font-semibold text-foreground"
                >
                  <Icon className="w-3 h-3 text-primary" /> {label}
                </span>
              ))}
            </div>

            {showUpsell && (
              <>
                {/* ─── LIVE PRICE BLOCK ─── */}
                <div className="mt-6 mx-auto max-w-sm">
                  {pricingLoading ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-20 rounded-card bg-foreground/5 animate-pulse" />
                      <div className="h-20 rounded-card bg-foreground/5 animate-pulse" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Monthly */}
                      <button
                        type="button"
                        data-testid="start-premium-monthly"
                        onClick={() => setSelected('monthly')}
                        className={`relative rounded-card border-2 p-3 text-left transition-all ${
                          selected === 'monthly'
                            ? 'border-primary bg-primary/10'
                            : 'border-border/60 bg-card/60 hover:border-primary/40'
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Monthly</p>
                        <p className="mt-1 font-display font-extrabold text-foreground text-xl leading-none">
                          {formatMoney(monthlyAmount, currency)}
                          <span className="text-[10px] font-medium text-muted-foreground">/mo</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">Billed monthly</p>
                      </button>

                      {/* Yearly — best value */}
                      <button
                        type="button"
                        data-testid="start-premium-yearly"
                        onClick={() => setSelected('yearly')}
                        className={`relative rounded-card border-2 p-3 text-left transition-all overflow-hidden ${
                          selected === 'yearly'
                            ? 'border-accent bg-gradient-to-br from-accent/15 to-primary/10 shadow-[0_0_18px_hsl(var(--accent)/0.35)]'
                            : 'border-border/60 bg-card/60 hover:border-accent/40'
                        }`}
                      >
                        <span className="absolute -top-2 right-2 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center gap-0.5 shadow">
                          <Flame className="w-2.5 h-2.5" />
                          {yearlySavingsPct > 0 ? `Save ${yearlySavingsPct}%` : 'Best Value'}
                        </span>
                        <p className="text-[10px] uppercase tracking-wide font-bold text-accent">Yearly</p>
                        <p className="mt-1 font-display font-extrabold text-foreground text-xl leading-none">
                          {formatMoney(yearlyAmount / 12, currency)}
                          <span className="text-[10px] font-medium text-muted-foreground">/mo</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatMoney(yearlyAmount, currency)} billed yearly
                        </p>
                      </button>
                    </div>
                  )}
                </div>

                <motion.div
                  animate={reducedMotion ? undefined : { scale: [1, 1.03, 1] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  whileTap={{ scale: 0.97 }}
                  className="mt-4"
                >
                  <Button
                    data-testid="start-premium-cta"
                    onClick={() => openConfirm(selected)}
                    disabled={loading || pricingLoading}
                    className="relative overflow-hidden w-full h-14 gradient-primary text-primary-foreground font-display font-bold rounded-btn text-base gap-2 shadow-[0_0_28px_hsl(var(--primary)/0.6)]"
                  >
                    <span className="pointer-events-none absolute inset-0 animate-shimmer opacity-70" aria-hidden />
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
                    ) : (
                      <>
                        <Rocket className="w-5 h-5" />
                        Start Premium — {selected === 'yearly' ? formatYearly() : formatMonthly()}
                      </>
                    )}
                  </Button>
                </motion.div>

                {/* Trust line */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Check className="w-3 h-3 text-success" strokeWidth={3} /> Cancel anytime</span>
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-success" /> Secure payments</span>
                  <span className="flex items-center gap-1"><Check className="w-3 h-3 text-success" strokeWidth={3} /> Restore purchases</span>
                </div>
              </>
            )}

            {/* Trust badge */}
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-warning" fill="currentColor" />
                ))}
                <span className="ml-1.5 text-[11px] font-semibold text-foreground">Loved by Habit Builders</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Active subscription — plan, amount, next billing */}
        {isPaidPremium && (() => {
          const planLabel = planLabelFor(activeSub?.plan_interval);
          // Google Play rows store whole currency units; Paystack rows store cents.
          // For Play, prefer Google's localized price string for this plan.
          const isPlaySub = activeSub?.provider === 'google_play';
          const playPlanPrice = normalizePlanInterval(activeSub?.plan_interval) === 'yearly'
            ? play.prices.yearly : play.prices.monthly;
          const chargedAmount = isPlaySub
            ? (playPlanPrice?.priceString
              ?? (activeSub?.amount != null && activeSub?.currency ? formatMoney(activeSub.amount, activeSub.currency) : null))
            : activeSub?.amount != null && activeSub?.currency
              ? formatMoney(activeSub.amount / 100, activeSub.currency)
              : null;
          const chargedInterval = intervalSuffixFor(activeSub?.plan_interval);
          const billingIso = activeSub?.next_payment_date ?? activeSub?.current_period_end ?? nextBillingDate?.toISOString() ?? null;
          const billingDate = billingIso ? new Date(billingIso) : null;
          const billingLabel = activeSub?.cancel_at_period_end ? 'Expires on' : 'Next billing';
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-5 rounded-card bg-gradient-to-br from-success/12 via-card to-accent/12 border border-success/30"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-success/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-success" strokeWidth={3} />
                  </div>
                  <div>
                    <p className="font-display font-bold text-body text-foreground leading-tight">Premium Active</p>
                    <p className="text-caption text-muted-foreground">{planLabel}</p>
                  </div>
                </div>
                {chargedAmount && (
                  <div className="text-right">
                    <p className="font-display font-extrabold text-foreground text-lg leading-none">
                      {chargedAmount}<span className="text-[10px] font-medium text-muted-foreground">{chargedInterval}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">per billing cycle</p>
                  </div>
                )}
              </div>
              {billingDate && (
                <div className="mt-3 pt-3 border-t border-success/20 flex items-center justify-between text-caption">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> {billingLabel}
                  </span>
                  <span className="font-semibold text-foreground">
                    {billingDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
              {!pricingLoading && !pricingError && (
                <p className="mt-3 text-[10px] text-muted-foreground text-center">
                  Standard rate: {formatMoney(monthlyAmount, currency)}/mo · {formatMoney(yearlyAmount, currency)}/yr
                </p>
              )}
            </motion.div>
          );
        })()}

        {/* ─── BENEFITS ───────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-h2 font-display font-bold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" /> What you unlock
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <BenefitCard emoji="🧠" title="Unlimited Winston AI" body="Coaching whenever you need it." delay={0} />
            <BenefitCard emoji="📈" title="Advanced Insights" body="Weekly & monthly performance reports." delay={0.05} />
            <BenefitCard emoji="🎨" title="Premium Cosmetics" body="Outfits, crowns, pets & effects." delay={0.1} />
            <BenefitCard emoji="🏆" title="Premium Challenges" body="Bigger rewards, exclusive badges." delay={0.15} />
            <BenefitCard emoji="🔔" title="Smart Reminders" body="AI‑timed nudges when you'll act." delay={0.2} />
          </div>
        </section>

        {/* ─── PREMIUM PERKS (locked until entitled) ──────── */}
        <section className="mb-10">
          <h2 className="text-h2 font-display font-bold text-foreground mb-1">
            {previewState === 'unlocked' ? 'Your Premium perks' : 'A peek inside'}
          </h2>
          <p className="text-caption text-muted-foreground mb-4">
            {previewState === 'unlocked'
              ? 'Included with your active Premium subscription.'
              : previewState === 'loading'
                ? 'Checking your Premium status…'
                : 'Blurred previews of what awaits.'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {PREMIUM_PREVIEWS.map(preview => (
              <PremiumPreviewCard key={preview.id} preview={preview} state={previewState} onOpen={navigate} />
            ))}
          </div>
        </section>

        {/* ─── SOCIAL PROOF ────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-h2 font-display font-bold text-foreground mb-1 flex items-center gap-2">
            <Heart className="w-5 h-5 text-accent" fill="currentColor" /> Why members love Premium
          </h2>
          <p className="text-caption text-muted-foreground mb-4">Real stories from real habit builders.</p>
          <div className="grid grid-cols-1 gap-3">
            <Testimonial quote="Winston helped me stay consistent for over 100 days." name="Amara K." />
            <Testimonial quote="The AI coaching alone is worth it." name="Jordan P." />
            <Testimonial quote="The reports keep me motivated every week." name="Priya S." />
          </div>
        </section>

        {/* ─── PLAN SELECTOR ───────────────────────────────── */}
        {showUpsell && (
          <section className="mb-6">
            <h2 className="text-h2 font-display font-bold text-foreground mb-4">Choose your plan</h2>
            <div className="space-y-3">
              {/* Monthly */}
              <motion.button
                data-testid="start-premium-monthly-plan"
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                onClick={() => setSelected('monthly')}
                className={`w-full p-4 rounded-card border-2 text-left transition-colors ${
                  selected === 'monthly' ? 'border-primary bg-primary/5 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.4)]' : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-body text-foreground font-display flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-muted-foreground" /> Monthly
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Billed monthly · cancel anytime</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-body text-foreground">{formatMoney(monthlyAmount, currency)}<span className="text-[10px] font-normal text-muted-foreground">/mo</span></p>
                    <p className="text-[10px] text-muted-foreground">{formatUsd(usd(monthlyAmount))}</p>
                  </div>
                </div>
              </motion.button>

              {/* Yearly (most popular) */}
              <motion.button
                data-testid="start-premium-yearly-plan"
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                onClick={() => setSelected('yearly')}
                className={`relative w-full p-4 rounded-card border-2 text-left transition-colors overflow-hidden ${
                  selected === 'yearly'
                    ? 'border-primary bg-gradient-to-br from-primary/10 via-card to-accent/10 shadow-[0_0_20px_hsl(var(--primary)/0.25)]'
                    : 'border-border bg-card'
                }`}
              >
                {selected === 'yearly' && (
                  <span className="pointer-events-none absolute inset-0 animate-shimmer opacity-40" aria-hidden />
                )}
                <span className="absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center gap-1 shadow">
                  <Flame className="w-3 h-3" /> Most Popular
                </span>
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="font-bold text-body text-foreground font-display flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-warning" fill="currentColor" /> Yearly
                    </p>
                    <p className="text-[11px] text-success font-semibold mt-0.5">Save {formatMoney(Math.max(0, monthlyAmount * 12 - yearlyAmount), currency)} per year</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-body text-primary">{formatMoney(yearlyAmount, currency)}<span className="text-[10px] font-normal text-muted-foreground">/yr</span></p>
                    <p className="text-[10px] text-muted-foreground">{formatUsd(usd(yearlyAmount))}</p>
                    <p className="text-[10px] text-muted-foreground">~{formatMoney(yearlyAmount / 12, currency)}/mo</p>
                  </div>
                </div>
              </motion.button>
            </div>
          </section>
        )}

        {/* CTA */}
        {entitlementLoading ? (
          <div className="flex items-center justify-center gap-2 h-12 mb-4 text-caption text-muted-foreground" aria-live="polite">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking your Premium status…
          </div>
        ) : !isPaidPremium ? (
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              data-testid="start-premium-cta-plan"
              onClick={() => openConfirm(selected)}
              disabled={loading || play.purchasing}
              className="relative overflow-hidden w-full h-12 gradient-primary text-primary-foreground font-bold rounded-btn text-base gap-2 shadow-lg glow-primary mb-4"
            >
              <span className="pointer-events-none absolute inset-0 animate-shimmer opacity-60" aria-hidden />
              {loading || play.purchasing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {play.isPlay ? 'Opening Google Play…' : 'Opening checkout…'}</>
              ) : (
                selected === 'yearly'
                  ? <>Start Yearly — {priceFor('yearly')}/yr</>
                  : <>Start Monthly — {priceFor('monthly')}/mo</>
              )}
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-2 mb-4">
            <Button onClick={handleManage} variant="outline" className="w-full rounded-btn">
              {play.isPlay ? 'Manage subscription in Google Play' : 'Cancel subscription'}
            </Button>
            <Button onClick={handleRestore} variant="ghost" className="w-full rounded-btn text-sm" disabled={restoring || play.restoring}>
              {(restoring || play.restoring) ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Syncing…</> : 'Restore purchases / sync'}
            </Button>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground mb-10">
          <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {play.isPlay ? 'Secure payment by Google Play' : 'Secure payment by Paystack'}</span>
          <span>·</span>
          <span>Cancel anytime</span>
        </div>

        {/* ─── COMPARISON TABLE ────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-h2 font-display font-bold text-foreground mb-3">Free vs Premium</h2>
          <div className="rounded-card border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_70px_90px] items-center px-3 py-2.5 bg-secondary/40 border-b border-border">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Feature</span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground text-center">Free</span>
              <span className="relative text-[11px] font-bold uppercase tracking-wide text-primary text-center">
                Premium
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[8px] font-bold whitespace-nowrap shadow">
                  ★
                </span>
              </span>
            </div>
            {SECTIONS.map((section, si) => (
              <div key={section.title} className="border-b border-border last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <section.icon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">{section.title}</span>
                </div>
                {section.rows.map((row, ri) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 0.35, delay: Math.min(ri * 0.05 + si * 0.05, 0.5), ease: 'easeOut' }}
                    whileHover={{ backgroundColor: 'hsl(var(--primary) / 0.05)' }}
                    className="grid grid-cols-[1fr_70px_90px] items-center px-3 py-2.5 border-t border-border/40"
                  >
                    <span className="text-[12px] text-foreground leading-snug pr-2">{row.label}</span>
                    <span className="flex items-center justify-center"><Cell v={row.free} /></span>
                    <span className="flex items-center justify-center bg-primary/[0.04]"><Cell v={row.premium} accent /></span>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {/* ─── UPGRADE CTA CARD (near bottom) ─────────────── */}
        {showUpsell && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 relative rounded-card overflow-hidden border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-accent/15 p-6 shadow-[0_10px_40px_-10px_hsl(var(--primary)/0.4)]"
          >
            <motion.div
              aria-hidden
              className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, hsl(var(--accent) / 0.35) 0%, transparent 70%)' }}
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.25, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <FloatingParticles count={8} reduced={!!reducedMotion} />
            <div className="relative text-center">
              <h2 className="font-display font-extrabold text-h2 text-foreground leading-tight">
                Ready to unlock your <span className="text-gradient-gold">full potential?</span>
              </h2>
              <ul className="mt-4 space-y-1.5 text-left inline-block">
                {[
                  'Unlimited AI Coaching',
                  'Premium Challenges',
                  'Exclusive Rewards',
                  'Advanced Reports',
                  'Avatar Store',
                  'Priority Features',
                ].map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -6 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="flex items-center gap-2 text-caption text-foreground"
                  >
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={3} />
                    {item}
                  </motion.li>
                ))}
              </ul>
              <motion.div
                animate={reducedMotion ? undefined : { scale: [1, 1.03, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                whileTap={{ scale: 0.97 }}
                className="mt-6"
              >
                <Button
                  data-testid="start-premium-cta-footer"
                  onClick={() => openConfirm(selected)}
                  disabled={loading}
                  className="relative overflow-hidden w-full h-14 gradient-primary text-primary-foreground font-display font-bold rounded-btn text-base gap-2 shadow-[0_0_28px_hsl(var(--primary)/0.6)]"
                >
                  <span className="pointer-events-none absolute inset-0 animate-shimmer opacity-70" aria-hidden />
                  <Zap className="w-5 h-5" /> Start Premium Today
                </Button>
              </motion.div>

              <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Secure payment</span>
                <span>·</span>
                <span>Cancel anytime</span>
                <span>·</span>
                <span>Instant activation</span>
              </div>
            </div>
          </motion.section>
        )}

        {/* ─── REFERRAL PROGRESS ───────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-h2 font-display font-bold text-foreground mb-1 flex items-center gap-2">
            <Gift className="w-5 h-5 text-accent" /> Earn free Premium
          </h2>
          <p className="text-caption text-muted-foreground mb-4">
            Referral rewards are Premium time only, not cash. Earn 7, 30 or 90 free Premium days at 1, 3 or 10 verified paid Premium referrals, and lifetime Premium at 20.
          </p>

          <div className="rounded-card border border-accent/25 bg-gradient-to-br from-accent/10 via-card to-primary/5 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-caption font-semibold text-foreground">
                {nextTier ? `${paidReferralCount} / ${nextTier.count} qualified paid referrals` : `${paidReferralCount} qualified paid referrals`}
              </span>
              <span className="text-[10px] font-bold text-accent uppercase tracking-wide">
                {nextTier ? `Next: ${nextTier.reward}` : 'All milestones unlocked'}
              </span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${refProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_10px_hsl(var(--primary)/0.5)]"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {refTiers.map((t) => {
                const done = paidReferralCount >= t.count;
                return (
                  <div
                    key={t.count}
                    className={`rounded-btn p-2 text-center border ${
                      done
                        ? 'border-success/40 bg-success/10'
                        : 'border-border bg-secondary/30'
                    }`}
                  >
                    <p className="text-[10px] font-bold text-foreground">{t.count} paid referrals</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.reward}</p>
                    {done && <Check className="w-3 h-3 text-success mx-auto mt-1" strokeWidth={3} />}
                  </div>
                );
              })}
            </div>
          </div>

          <InviteEarnCard />
        </section>

        {/* ─── FAQ ─────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-h2 font-display font-bold text-foreground mb-3">Frequently asked</h2>
          <Accordion type="single" collapsible className="space-y-2">
            {[
              { q: 'Can I cancel anytime?', a: "Yes. Cancel from this page anytime — you'll keep Premium until the end of the current billing period." },
              { q: 'What happens to my habits if I downgrade?', a: 'Nothing is deleted. Existing habits stay, but Free accounts cannot add another habit while they have 4 or more.' },
              { q: 'How many Winston messages do free users get?', a: '5 messages per UTC day. Premium and the active 5-day trial get unlimited Winston messages.' },
              { q: 'Which currency am I charged in?', a: play.isPlay ? 'Google Play shows and charges the supported currency for your Play account and region.' : 'Web billing uses the currency shown at secure Paystack checkout. Any USD estimate is for reference only.' },
            ].map((item, i) => (
              <AccordionItem
                key={item.q}
                value={`q${i}`}
                className="rounded-card border border-border bg-card px-4 data-[state=open]:border-primary/30 data-[state=open]:bg-gradient-to-br data-[state=open]:from-primary/5 data-[state=open]:to-card transition-colors"
              >
                <AccordionTrigger className="text-sm text-left font-semibold hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-caption text-muted-foreground pb-3 leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </div>

      <PublicFooter />

      <UpgradeConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        plan={selected as UpgradePlan}
        priceLabel={PRICE_LABEL[selected]}
        priceSubtext={!play.isPlay && selected === 'yearly' ? `~${formatMoney(yearlyAmount / 12, currency)}/mo` : undefined}
        hasTrial={false}
        loading={loading}
        onConfirm={handleCheckout}
      />
    </div>
  );
}
