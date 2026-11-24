import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Scroll } from 'lucide-react';
import PublicFooter from '@/components/PublicFooter';
import { usePageMeta } from '@/lib/usePageMeta';
import { ADMIN_EMAIL, SELLER_NAME } from '@/lib/contactEmails';

export default function TermsOfService() {
  const navigate = useNavigate();
  usePageMeta({
    title: 'Terms of Service — HabTastic AI',
    description: 'The terms governing HabTastic AI: eligibility, Premium subscriptions, advertising, Google Play and Paystack billing, refunds, acceptable use, and liability.',
    canonicalPath: '/terms',
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
          <Scroll className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-h1 text-foreground">Terms of Service</h1>
      </div>

      <p className="text-caption text-muted-foreground mb-6">Last updated: September 2026</p>

      <div className="space-y-6 text-body text-foreground/90 leading-relaxed">
        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">1. Who you are contracting with</h2>
          <p>
            The HabTastic AI service ("HabTastic AI", "Service") is provided by{' '}
            <strong>{SELLER_NAME}</strong> ("we", "us"). By creating an account
            or otherwise using HabTastic AI you ("you", "user") enter into a
            contract with {SELLER_NAME} on these Terms and our Privacy Policy.
            If you don't agree, please don't use the Service.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">2. Eligibility & account</h2>
          <p>
            You must be at least 13 years old. You're responsible for keeping
            your password confidential and for all activity on your account.
            You must provide accurate information and keep it up to date.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">3. Payments — Google Play and Paystack</h2>
          <p>
            Premium subscriptions purchased in the native Android app are
            processed through <strong>Google Play Billing</strong>. Web and other
            supported non-Play checkout flows are processed by our payment
            provider <strong>Paystack</strong>. {SELLER_NAME} provides the
            Service, while the payment provider used for your purchase handles
            payment processing, recurring billing, payment credentials and
            payment-related fraud controls. Charges and payment descriptors may
            differ depending on the provider used.
          </p>
          <p className="mt-2">
            Google Play purchases are subject to Google Play's applicable
            payment, subscription-management and account terms. For Paystack
            purchases, card details are entered on a Paystack-hosted checkout
            page and are governed by{' '}
            <a
              href="https://paystack.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Paystack's Terms of Service
            </a>{' '}
            in addition to these Terms.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">4. Subscriptions, trials & renewal</h2>
          <p>
            Premium plans are offered on a monthly or yearly basis. New
            accounts receive a 5-day free trial of Premium features; you are
            not charged during the trial and can let it expire without
            entering payment details. When a trial or paid Premium period ends,
            Premium progress stays saved while Free limits apply. Renewing
            Premium restores access to that saved progress. Once you start a paid subscription it
            auto-renews at the same interval until cancelled. Subscription
            management follows the payment provider used for the purchase.
            Google Play subscriptions are managed through Google Play, while
            supported Paystack subscriptions can be managed through the app.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">5. Refunds</h2>
          <p>
            Refunds are governed by our{' '}
            <a href="/refunds" className="text-primary underline">Refund Policy</a>.
            Refund eligibility and processing may also be subject to the rules
            of the payment provider used for your purchase. Approved Paystack
            refunds are returned to the original payment method through
            Paystack. Google Play purchases are handled through Google Play's
            applicable refund and subscription processes.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">6. Acceptable use</h2>
          <p>
            You must not misuse the Service. In particular, you must not: (a)
            use HabTastic AI unlawfully or for fraud, spam or harassment; (b)
            infringe intellectual-property rights of others; (c) interfere with
            security (malware, scraping, probing, bypassing rate limits or
            access controls); or (d) misuse the AI coach to generate illegal,
            harmful or abusive content. We may suspend or terminate accounts
            for material breach, non-payment, security/fraud risk, or
            repeated/serious policy violations.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">7. Intellectual property & licence</h2>
          <p>
            {SELLER_NAME} retains all right, title and interest in and to the
            Service, including its software, branding and documentation.
            Subject to these Terms, we grant you a limited, non-exclusive,
            non-transferable right to use the Service within your selected
            plan. You may not reverse-engineer, resell or redistribute the
            Service or circumvent its technical limits.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">8. Your content</h2>
          <p>
            You own your habit data, journal entries, uploads and other
            content. You grant {SELLER_NAME} a limited, worldwide, royalty-free
            licence to host, store and process your content solely to provide
            the Service.
          </p>
        </section>

        <section id="community">
          <h2 className="font-semibold text-h3 text-foreground mb-2">8a. Community &amp; user content</h2>
          <p className="mb-2">
            HabTastic AI includes community features (activity feed, comments,
            reactions, challenges and accountability partners) where members can
            see content created by others. You must accept these community rules
            before you can post, comment or react, and you are responsible for
            everything you share.
          </p>
          <p className="mb-1 font-medium text-foreground">Prohibited content and behaviour:</p>
          <ul className="list-disc pl-5 space-y-1 mb-2">
            <li>Illegal content or activity</li>
            <li>Hate speech or harassment</li>
            <li>Threats, violence or encouragement of self-harm</li>
            <li>Sexual, exploitative or child-endangering content</li>
            <li>Spam, scams or misleading promotions</li>
            <li>Impersonation of other people or brands</li>
            <li>Privacy violations, including sharing other people&rsquo;s personal data</li>
            <li>Any other abusive or objectionable content</li>
          </ul>
          <p className="mb-2">
            We may remove or hide content that breaches these rules and may
            restrict, suspend or terminate accounts, with or without notice where
            required for safety or legal reasons.
          </p>
          <p>
            Every member can report content for review, and can mute or block
            other members at any time from the menu on a post or comment.
            Reports are reviewed by our moderation team.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">9. AI features</h2>
          <p>
            HabTastic AI includes AI coaching and content generation. Outputs may
            be inaccurate or incomplete and are provided for motivation and
            habit-building only — not medical, legal, financial or professional
            advice. You are responsible for your prompts and for verifying any
            output before relying on it. We may filter, refuse or remove
            content that violates these Terms.
          </p>
        </section>

        <section id="advertising">
          <h2 className="font-semibold text-h3 text-foreground mb-2">9a. Advertising</h2>
          <p className="mb-2">
            The Free tier is supported by advertising. Eligible Free users in
            the native Android/iOS app may receive ads through <strong>Google
            AdMob</strong>. Eligible Free users on the HabTastic AI website/PWA
            may receive ads through <strong>Google AdSense</strong>.
          </p>
          <p className="mb-2">
            Native AdMob formats may include banners, interstitials and optional
            rewarded ads. AdMob may use a device advertising identifier and ad
            interaction data. AdSense may use cookies or similar browser/device
            information and ad interaction data to deliver, limit and measure
            advertising. Google privacy/consent requirements apply where required
            by law. You can manage Google ad personalization at{' '}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              adssettings.google.com
            </a>.
          </p>
          <p>
            Premium subscribers and users in an active Premium trial are ad-free.
            You may not interfere with, automate, spoof or otherwise manipulate
            ad delivery or rewarded-ad completions; doing so is a breach of these
            Terms and may result in loss of earned rewards or account suspension.
            See our Privacy Policy for details of the data processed for
            advertising.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">10. Service availability & warranties</h2>
          <p>
            The Service is provided "as is". To the fullest extent permitted by
            law, we disclaim all implied warranties (merchantability, fitness
            for a particular purpose, non-infringement). We do not guarantee
            uninterrupted or error-free performance.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">11. Liability</h2>
          <p>
            To the fullest extent permitted by law, our aggregate liability for
            any claims arising out of or relating to the Service is limited to
            the fees you paid to us in the 12 months preceding the event giving
            rise to the claim. We are not liable for indirect, consequential,
            special or punitive damages, including loss of profits, data or
            goodwill. Nothing in these Terms excludes liability for fraud,
            death or personal injury caused by negligence, where such
            exclusion is prohibited by law.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">12. Termination</h2>
          <p>
            You can delete your account at any time. On termination your access
            ends; we will delete or anonymise your personal data as described
            in our Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">13. Changes</h2>
          <p>
            We may update these Terms from time to time. We'll notify you of
            material changes in-app. Continued use after the update means you
            accept the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">14. Contact</h2>
          <p>
            Questions about these Terms?{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>
          </p>
        </section>
      </div>

      <PublicFooter />
    </motion.div>
  );
}
