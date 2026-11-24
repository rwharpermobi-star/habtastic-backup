import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, XCircle } from 'lucide-react';
import PublicFooter from '@/components/PublicFooter';
import { ADMIN_EMAIL, SUPPORT_EMAIL } from '@/lib/contactEmails';
import { usePageMeta } from '@/lib/usePageMeta';

export default function Cancellation() {
  const navigate = useNavigate();
  usePageMeta({
    title: 'Cancellation Policy — HabTastic AI',
    description: 'How to cancel HabTastic Premium on Google Play or the website, when billing stops, and how long you keep Premium access after cancelling.',
    canonicalPath: '/cancellation',
  });
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
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <XCircle className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-h1 text-foreground">Cancellation Policy</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">Last updated: September 2026</p>

      <section className="space-y-6 text-foreground/90 text-[15px] leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Cancel anytime</h2>
          <p>
            You can cancel your HabTastic Premium subscription at any time,
            for any reason. There is no cancellation fee and no long-term
            commitment beyond the billing period you already purchased.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. How to cancel</h2>
          <p>
            If you subscribed in the native Android app, manage or cancel the
            subscription through <strong>Google Play</strong>. HabTastic links
            Android subscribers to Google Play subscription management from the
            Premium or Subscription screens. If you subscribed on the web through
            Paystack, use <strong>Settings → Subscription</strong> and the
            available cancellation control. You can also email{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">{ADMIN_EMAIL}</a>{' '}
            if you need help identifying the correct billing route.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Future billing stops</h2>
          <p>
            After cancellation is accepted by the payment provider, the
            subscription will not renew after the current paid billing period.
            Google Play subscriptions follow Google Play's cancellation state;
            Paystack web subscriptions follow the cancellation state recorded
            for the Paystack subscription.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Access until period ends</h2>
          <p>
            Premium features normally remain active until the end of the billing
            period you already paid for (monthly or yearly), unless the payment
            provider or applicable refund action ends entitlement earlier. After
            Premium entitlement expires, your account returns to the Free plan
            and your existing data is preserved.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Refunds are separate</h2>
          <p>
            Cancelling stops future renewal but does not itself create a refund
            for unused time in the current period. If you believe you qualify
            for a refund, including for a duplicate or accidental charge, see our{' '}
            <a href="/refunds" className="text-primary underline">Refund Policy</a>.
            Refund handling follows the provider used for the original purchase.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Contact</h2>
          <p>
            Questions about cancellation? Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>.
          </p>
        </div>
      </section>

      <PublicFooter />
    </motion.div>
  );
}
