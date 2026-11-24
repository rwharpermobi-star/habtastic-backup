import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import PublicFooter from '@/components/PublicFooter';
import { usePageMeta } from '@/lib/usePageMeta';
import { ADMIN_EMAIL, SELLER_NAME } from '@/lib/contactEmails';

export default function Refunds() {
  const navigate = useNavigate();
  usePageMeta({
    title: 'Refund Policy — HabTastic',
    description: 'HabTastic Premium refund policy for Google Play and Paystack purchases, including duplicate or accidental charges and provider-specific refund processing.',
    canonicalPath: '/refunds',
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
          <RotateCcw className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-h1 text-foreground">Refund Policy</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">Last updated: September 2026</p>

      <section className="space-y-6 text-foreground/90 text-[15px] leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Case-by-case review</h2>
          <p>
            {SELLER_NAME} reviews eligible refund requests for HabTastic Premium
            on a <strong>case-by-case</strong> basis, subject to the rules of the
            payment provider used for the purchase. We aim to be fair and
            reasonable, especially where a charge was clearly unintended.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Duplicate or accidental charges</h2>
          <p>
            Duplicate charges, accidental purchases, and charges made without
            the account holder's knowledge may qualify for a refund. Please
            report the issue as soon as you notice it. Provider-specific
            eligibility rules may apply.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Request window</h2>
          <p>
            For web purchases processed through Paystack, please submit refund
            requests within <strong>7 days</strong> of the original charge date.
            Requests outside this window are reviewed case by case. Google Play
            purchases are subject to Google Play's applicable refund windows and
            processes. Cancellation remains available separately (see our{' '}
            <a href="/cancellation" className="text-primary underline">
              Cancellation Policy
            </a>).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. How to request a refund</h2>
          <p>
            For Paystack web purchases, email{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>{' '}
            from the address on your account. For Google Play purchases, use
            Google Play's applicable refund/support flow; you can also contact
            us if you need help identifying the purchase. Include:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Your HabTastic account email</li>
            <li>The plan you purchased</li>
            <li>Date of purchase</li>
            <li>Your Google Play order ID or Paystack transaction reference, where available</li>
            <li>A brief reason for the request</li>
          </ul>
          <p className="mt-2">
            We aim to respond to support requests within <strong>2 business days</strong>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Processing time</h2>
          <p>
            Approved refunds are returned through the provider used for the
            original purchase. Paystack refunds are returned to the original
            payment method and may take several business days to appear,
            depending on the bank. Google Play refund timing is governed by
            Google Play and the original payment method.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Payment processing</h2>
          <p>
            Premium purchases made in the native Android app are processed by
            <strong>Google Play Billing</strong>. Supported web purchases are
            processed by <strong>Paystack</strong>. Refund handling follows the
            original payment channel and its applicable rules.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Contact</h2>
          <p>
            Billing & payment support:{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>
            . General & business enquiries:{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>.
          </p>
        </div>
      </section>

      <PublicFooter />
    </motion.div>
  );
}
