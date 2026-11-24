import { forwardRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Crown, Check, Loader2, Shield, Sparkles, ChevronRight } from 'lucide-react';
import { shouldUsePlayBilling } from '@/lib/googlePlayBilling';

export type UpgradePlan = 'monthly' | 'yearly';

const PLAN_LABELS: Record<UpgradePlan, { label: string; recurrence: string; emoji: string }> = {
  monthly: { label: 'Monthly Premium', recurrence: 'Billed every month · cancel anytime', emoji: '📅' },
  yearly: { label: 'Yearly Premium', recurrence: 'Billed every 12 months · cancel anytime', emoji: '🗓' },
};

const UNLOCKS = [
  'Unlimited habits & daily tracking',
  'Full AI coaching (Winston, no limits)',
  
  'Advanced analytics, trends & predictions',
  'Custom themes & smart reminders',
  'Ad-free experience and priority support',
];

interface UpgradeConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: UpgradePlan;
  priceLabel: string;
  /** Optional secondary line, e.g. "$3.17/mo" or "Then $4.99/mo after trial" */
  priceSubtext?: string;
  /** Whether a 5-day trial precedes the first charge */
  hasTrial?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

/**
 * Premium upgrade confirmation modal — surfaces unlocks, billing terms
 * and the selected plan before redirecting to checkout.
 *
 * Wrapped in forwardRef because it's rendered as a direct child of a
 * Radix `<Dialog>` (in Paywall), which forwards a ref to its child.
 */
const UpgradeConfirmModal = forwardRef<HTMLDivElement, UpgradeConfirmModalProps>(function UpgradeConfirmModal({
  open,
  onOpenChange,
  plan,
  priceLabel,
  priceSubtext,
  hasTrial = false,
  loading = false,
  onConfirm,
}, _ref) {
  const meta = PLAN_LABELS[plan];
  const isPlay = shouldUsePlayBilling();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm mx-auto p-0 border-0 rounded-card overflow-hidden bg-background">
        {/* Hero */}
        <div className="gradient-primary p-5 text-center text-primary-foreground relative">
          <motion.div
            className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-2"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Crown className="w-7 h-7 text-warning drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]" />
          </motion.div>
          <DialogHeader className="space-y-1 text-center">
            <DialogTitle className="text-base font-bold text-white font-display text-center">
              Confirm your upgrade
            </DialogTitle>
            <p className="text-xs text-white/85">{meta.emoji} {meta.label}</p>
          </DialogHeader>
        </div>

        {/* Plan summary */}
        <div className="px-5 pt-4 pb-2">
          <div className="rounded-card border border-border bg-secondary/40 p-3 flex items-center justify-between">
            <div className="text-left">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
                {hasTrial ? 'After 5-day free trial' : 'You pay today'}
              </p>
              <p className="text-sm font-bold text-foreground">{priceLabel}</p>
              {priceSubtext && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{priceSubtext}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">{meta.recurrence}</p>
            </div>
          </div>
        </div>

        {/* Unlocks list */}
        <div className="px-5 pt-3 pb-4">
          <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            What you unlock instantly
          </p>
          <ul className="space-y-1.5">
            {UNLOCKS.map((unlock) => (
              <li key={unlock} className="flex items-start gap-2 text-xs text-foreground">
                <span className="w-4 h-4 rounded-full bg-success/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-2.5 h-2.5 text-success" />
                </span>
                <span>{unlock}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Route disclaimer */}
        <div className="px-5 pb-2">
          <div className="rounded-btn bg-muted/40 border border-border/60 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
            {isPlay
              ? 'Your purchase will be completed securely with Google Play.'
              : "You'll be redirected to our secure checkout to complete payment."}
            {hasTrial
              ? ' No charge today — cancel before the trial ends to avoid being billed.'
              : ' Your subscription auto-renews until cancelled.'}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-2 space-y-2">
          <Button
            data-testid="upgrade-confirm"
            onClick={onConfirm}
            disabled={loading}
            className="w-full h-12 gradient-primary text-primary-foreground font-bold rounded-btn text-sm gap-2 shadow-lg glow-primary"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {isPlay ? 'Opening Google Play...' : 'Opening checkout...'}</>
            ) : (
              <>
                {hasTrial ? 'Confirm & start free trial' : isPlay ? 'Confirm with Google Play' : 'Confirm & continue to checkout'}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="ghost"
            className="w-full h-10 rounded-btn text-muted-foreground"
            disabled={loading}
          >
            Cancel
          </Button>
          <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground pt-1">
            <Shield className="w-3 h-3" /> Secure payment · Cancel anytime
          </div>
          <p className="text-[10px] text-muted-foreground/80 text-center leading-relaxed pt-1">
            {isPlay ? (
              <>Payments are processed securely by Google Play. Manage or cancel your subscription in Google Play.</>
            ) : (
              <>Payments processed securely by <a href="https://paystack.com" target="_blank" rel="noopener noreferrer" className="underline">Paystack</a>. Cancel anytime in Settings.</>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default UpgradeConfirmModal;
