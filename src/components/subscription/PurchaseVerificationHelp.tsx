import { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Clock, LifeBuoy } from 'lucide-react';
import { ADMIN_EMAIL } from '@/lib/contactEmails';
import type { VerificationNotice } from '@/lib/purchaseVerification';

const FAILED_COPY: Record<string, string> = {
  account_mismatch:
    'This purchase belongs to a different HabTastic account. Sign in with the account you used when you bought Premium, then restore.',
  purchase_not_found:
    'Google Play could not find this purchase. Check it appears in Play Store › Payments & subscriptions on the Google account that paid, then restore.',
  missing_purchase_token:
    'Google Play did not hand the purchase back to the app. Check it appears in Play Store › Payments & subscriptions, then restore.',
  product_mismatch:
    'This purchase is not a HabTastic Premium plan. If you bought Premium, restore below or contact us.',
  not_entitled:
    'Google Play says this subscription is no longer active, so it cannot unlock Premium.',
  payment_not_successful:
    'Paystack reported that the payment did not go through. If you see a charge anyway, email us with your payment reference.',
  missing_reference:
    'Paystack did not send back a payment reference. If you were charged, check your subscription status below or email us.',
};

function noticeCopy(notice: VerificationNotice): { title: string; body: string } {
  const play = notice.provider === 'google_play';
  if (notice.state === 'pending') {
    return play
      ? {
          title: 'Confirming your Google Play purchase',
          body: "Google has your payment but hasn't sent us the confirmation yet. This usually takes a few minutes and can take up to 24 hours. Premium switches on by itself — please don't buy again.",
        }
      : {
          title: 'Confirming your payment',
          body: "Paystack hasn't confirmed your payment to us yet. If you were charged, Premium switches on by itself once it does, usually within a few minutes. Please don't pay again.",
        };
  }
  return {
    title: "We couldn't confirm your purchase",
    body: FAILED_COPY[notice.code] ?? "We couldn't confirm this purchase for your account. Try restoring below. Please don't buy again.",
  };
}

export function PurchaseVerificationNotice({ notice }: { notice: VerificationNotice }) {
  const { title, body } = noticeCopy(notice);
  const pending = notice.state === 'pending';
  const Icon = pending ? Clock : AlertCircle;
  return (
    <div
      role="status"
      className={`rounded-card border p-4 mb-4 ${pending ? 'bg-warning/10 border-warning/30' : 'bg-destructive/10 border-destructive/30'}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${pending ? 'text-warning' : 'text-destructive'}`} />
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-sm text-foreground/80 mt-1">{body}</p>
        </div>
      </div>
    </div>
  );
}

interface GuideProps {
  /** Running inside the Android app (Google Play Billing). */
  isPlay: boolean;
  /** Exact label of the restore/check button on this screen. */
  restoreLabel: string;
  defaultOpen?: boolean;
}

export function RestorePurchasesGuide({ isPlay, restoreLabel, defaultOpen = false }: GuideProps) {
  const [open, setOpen] = useState(defaultOpen);
  const steps = isPlay
    ? [
        'Sign in to HabTastic with the account you used when you bought Premium.',
        'Make sure the Play Store is signed in to the Google account that paid.',
        `Tap "${restoreLabel}" on this screen.`,
        'Give it a minute. Premium shows here as soon as Google confirms it.',
      ]
    : [
        'Sign in with the same email you used at checkout.',
        `Tap "${restoreLabel}" on this screen. We check with the payment provider directly.`,
        'Bought Premium in the Android app? Open HabTastic on that phone and tap "Restore Google Play purchases". Premium then works here too.',
      ];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between glass rounded-card px-4 py-3 shadow-card"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <LifeBuoy className="w-4 h-4 text-primary" />
          How to restore purchases
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="glass rounded-card p-4 shadow-card mt-2">
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-foreground/90">
                <span className="w-6 h-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-4">
            Still missing after 24 hours? Email{' '}
            <a className="underline" href={`mailto:${ADMIN_EMAIL}`}>{ADMIN_EMAIL}</a>{' '}
            with your {isPlay ? 'Google Play order number (it starts with GPA.)' : 'payment reference or Google Play order number'}.
          </p>
        </div>
      )}
    </div>
  );
}
