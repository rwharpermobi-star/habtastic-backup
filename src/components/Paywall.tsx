import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, ChevronRight, X, Check, Sparkles, Target, Brain, Shield, Loader2, Flame } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import UpgradeConfirmModal, { type UpgradePlan } from '@/components/UpgradeConfirmModal';
import { usePaystackCheckout } from '@/hooks/usePaystackCheckout';
import { useGooglePlayBilling } from '@/hooks/useGooglePlayBilling';
import { useAuth } from '@/contexts/AuthContext';

interface PaywallProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: string;
}

const BENEFITS = [
  { icon: Target, text: 'Your saved Premium progress unlocks immediately' },
  { icon: Target, text: 'Unlimited coaching access' },
  { icon: Brain, text: 'Smarter, personalized responses' },
  { icon: Sparkles, text: 'Advanced habit tracking & insights' },
  { icon: Shield, text: 'Completely ad-free experience' },
];

type Plan = 'yearly' | 'monthly';

const CTA_TEXT: Record<Plan, string> = {
  monthly: 'Start Monthly',
  yearly: 'Start Yearly Plan',
};

function Paywall({ open, onOpenChange, trigger }: PaywallProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { startCheckout } = usePaystackCheckout();
  const play = useGooglePlayBilling();
  const { user } = useAuth();

  const triggerText = (() => {
    switch (trigger) {
      case 'habits': return "You've reached the free habit limit.";
      case 'ai': return "You've used all free AI messages today.";
      case 'onboarding': return 'Start your transformation today.';
      case 'trial_expired': return 'Your trial ended, but your Premium progress is safely saved. Subscribe to continue exactly where you stopped.';
      default: return 'Get full access to your AI coaching system.';
    }
  })();

  // On Android only Google Play's own prices may be shown — never website prices.
  const playUnavailable = play.isPlay && (!play.supported || !play.prices.monthly || !play.prices.yearly);
  const playPricePending = play.isPlay ? (play.loadingPrices ? '…' : '—') : '';
  const monthlyPrice = play.isPlay ? play.prices.monthly?.priceString ?? playPricePending : 'R94.99';
  const yearlyPrice = play.isPlay ? play.prices.yearly?.priceString ?? playPricePending : 'R899.99';
  const PRICE_LABEL: Record<Plan, string> = {
    monthly: `${monthlyPrice}/mo`,
    yearly: `${yearlyPrice}/yr`,
  };

  const handleCheckout = async () => {
    if (!user) { toast.error('Please sign in first.'); return; }
    if (play.isPlay && (!play.supported || !play.prices[selectedPlan])) {
      toast.error('Google Play pricing is unavailable. Please try again later.');
      return;
    }
    setLoading(true);
    try {
      if (play.isPlay) {
        const ok = await play.purchase(selectedPlan);
        if (ok) {
          setConfirmOpen(false);
          onOpenChange(false);
        }
        return;
      }
      await startCheckout(selectedPlan);
      setConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || play.purchasing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 border-0 rounded-card max-w-sm mx-auto overflow-hidden bg-background shadow-xl">
        {/* Hero */}
        <div className="gradient-accent p-6 pb-5 text-center relative">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
          <motion.div
            className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-3 relative"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Crown className="w-8 h-8 text-warning drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
          </motion.div>
          <h2 className="text-lg font-bold text-white mb-1">Upgrade to Premium 👑</h2>
          <p className="text-white/80 text-xs">{triggerText}</p>
        </div>

        {/* Benefits */}
        <div className="px-5 pt-4 pb-2 space-y-2">
          {BENEFITS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-accent" />
              </div>
              <span className="text-sm font-medium text-foreground">{text}</span>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div className="px-5 pt-2 pb-2 space-y-2">
          <button
            onClick={() => setSelectedPlan('monthly')}
            className={`w-full p-3 rounded-card border-2 text-left transition-all ${
              selectedPlan === 'monthly' ? 'border-primary bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm text-foreground">Monthly</p>
              <p className="font-bold text-foreground">{monthlyPrice}<span className="text-[10px] text-muted-foreground font-normal">/mo</span></p>
            </div>
          </button>

          <button
            onClick={() => setSelectedPlan('yearly')}
            className={`w-full p-3 rounded-card border-2 text-left relative transition-all ${
              selectedPlan === 'yearly' ? 'border-primary bg-primary/5' : 'border-border bg-card'
            }`}
          >
            <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center gap-0.5">
              <Flame className="w-2.5 h-2.5" /> {play.isPlay ? 'Best value' : 'Save R239.89/yr'}
            </span>
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm text-foreground">Yearly</p>
              <p className="font-bold text-primary">{yearlyPrice}<span className="text-[10px] text-muted-foreground font-normal">/yr</span></p>
            </div>
          </button>
        </div>

        {/* CTA */}
        <div className="px-5 pb-5 pt-2 space-y-3">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={busy || playUnavailable}
            className="w-full h-11 gradient-orange text-accent-foreground font-semibold rounded-btn text-base gap-2 shadow-lg glow-accent"
          >
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {play.isPlay ? 'Opening Google Play…' : 'Opening checkout…'}</> : <>{CTA_TEXT[selectedPlan]} <ChevronRight className="w-4 h-4" /></>}
          </Button>

          {playUnavailable && !play.loadingPrices && (
            <p className="text-center text-xs text-muted-foreground">Google Play pricing is unavailable right now. Please try again later.</p>
          )}
          <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {play.isPlay ? 'Google Play billing' : 'Secure payment'}</span>
            <span>·</span>
            <span>Cancel anytime</span>
          </div>
        </div>
      </DialogContent>

      <UpgradeConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        plan={selectedPlan as UpgradePlan}
        priceLabel={PRICE_LABEL[selectedPlan]}
        hasTrial={false}
        loading={busy}
        onConfirm={handleCheckout}
      />
    </Dialog>
  );
}

export default Paywall;