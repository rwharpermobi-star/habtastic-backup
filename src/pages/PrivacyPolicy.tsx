import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import PublicFooter from '@/components/PublicFooter';
import { usePageMeta } from '@/lib/usePageMeta';
import { ADMIN_EMAIL, SUPPORT_EMAIL, SELLER_NAME } from '@/lib/contactEmails';
import { Button } from '@/components/ui/button';
import { isUsageAnalyticsEnabled, setUsageAnalyticsEnabled } from '@/lib/privacyPreferences';


export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(isUsageAnalyticsEnabled);
  usePageMeta({
    title: 'Privacy Policy — HabTastic AI',
    description: 'How HabTastic AI collects, uses, stores, and protects your personal data. GDPR rights, retention, subprocessors, advertising, and payment processing.',
    canonicalPath: '/privacy',
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
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-h1 text-foreground">Privacy Policy</h1>
      </div>

      <p className="text-caption text-muted-foreground mb-6">Last updated: October 2026</p>

      <div className="space-y-6 text-body text-foreground/90 leading-relaxed">
        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">1. Who we are</h2>
          <p>
            This service ("HabTastic AI", "we", "us") is operated by{' '}
            <strong>{SELLER_NAME}</strong>. {SELLER_NAME} acts as the data
            controller for personal data collected through the HabTastic AI
            application and website. Contact:{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">2. Categories of personal data we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account details: name, email address, password (hashed), avatar.</li>
            <li>Profile & app data: habits, journal entries, diary entries, goals, mood logs.</li>
            <li>AI coaching conversations, including text recognised from optional voice input.</li>
            <li>Gameplay data: XP, streaks, achievements, coins, gems.</li>
            <li>Usage & device data: IP address, device type, language, basic
              telemetry, error logs.</li>
            <li>Advertising data for Free users: native-app advertising identifiers
              such as Google Advertising ID (AAID), browser cookies or similar
              identifiers where applicable, and ad interaction/measurement data.</li>
            <li>Support communications you send to us.</li>
            <li>Push, email, analytics and advertising consent/preferences.</li>
          </ul>
          <p className="mt-2">
            <strong>Optional voice features:</strong> When you use voice input,
            we request microphone permission. Your browser or device speech
            provider may send audio to its servers to recognise speech. Our
            backend receives the resulting text rather than storing raw
            microphone recordings. Text you submit to Winston is processed and
            saved as part of your coaching conversation. For spoken replies,
            response text may be sent to ElevenLabs to generate audio; where
            available, device speech synthesis provides a fallback. You can
            use typed messages without granting microphone permission and
            revoke that permission in your device or browser settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">3. Purposes & legal basis</h2>
          <p>We process your personal data for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Providing the service</strong> (account, habits,
              reminders, AI coaching) — legal basis: <em>performance of a
              contract</em>.</li>
            <li><strong>Security & fraud prevention</strong> — legal basis:{' '}
              <em>legitimate interests</em>.</li>
            <li><strong>Product improvement & analytics</strong> — legal basis:{' '}
              <em>legitimate interests</em>.</li>
            <li><strong>Advertising on the Free tier</strong> — legal basis depends
              on jurisdiction and may include consent where required.</li>
            <li><strong>Customer support</strong> — legal basis:{' '}
              <em>performance of a contract</em>.</li>
            <li><strong>Marketing emails (where applicable)</strong> — legal basis:{' '}
              <em>consent</em>, which you can withdraw at any time.</li>
            <li><strong>Compliance with legal obligations</strong> — legal basis:{' '}
              <em>legal obligation</em>.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">4. Data sharing & recipients</h2>
          <p>We share personal data only with:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Service providers / sub-processors</strong> we use to run
              HabTastic AI, including hosting and database (Supabase), AI model
              providers (Google, OpenAI), and ElevenLabs, which receives
              response text when generating spoken replies. Optional speech
              recognition is provided by your browser or device speech service,
              which may process microphone audio on its servers. We also use
              advertising services from Google for eligible Free users.</li>
            <li><strong>Paystack Payments Limited ("Paystack")</strong>, our
              payment processor, to handle supported web subscription payments,
              recurring billing, card storage and fraud screening. When you
              purchase through Paystack, card and billing details are collected
              and processed by Paystack under their privacy policy at{' '}
              <a
                href="https://paystack.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                paystack.com/privacy
              </a>. {SELLER_NAME} only receives metadata such as the
              transaction reference, plan, amount, currency, status and
              renewal date — not your full card number.</li>
            <li><strong>Google Drive</strong>, only when you choose to enable My Diary
              sync. Diary entries are then copied from your device to HabTastic's
              private application-data area in your own Google Drive account. This
              Drive copy is controlled by your Google account and is not stored in
              HabTastic's Supabase diary table.</li>
            <li><strong>Google Play</strong>, to process Android subscription payments.
              We send an account identifier to link purchases to your HabTastic AI
              account and receive purchase tokens, product and subscription status,
              and renewal or expiry information for verification. Google processes
              your payment details; we do not receive your full card number.
              Google Play displays the price and currency charged.</li>
            <li><strong>Google AdMob</strong>, to serve native-app ads to eligible
              Free users. AdMob may process device advertising identifiers and
              ad interaction data.</li>
            <li><strong>Google AdSense</strong>, to serve advertising to eligible
              Free users on the HabTastic AI website/PWA. AdSense may use cookies,
              browser/device information and ad interaction data in accordance
              with Google's privacy policy at{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                policies.google.com/privacy
              </a>.</li>
            <li><strong>Professional advisers</strong> (legal, accounting) where
              necessary.</li>
            <li><strong>Authorities</strong> where required by law.</li>
          </ul>
          <p className="mt-2">We do not sell your personal data. Billing amounts processed via Paystack are charged in <strong>South African Rand (ZAR)</strong>. Any other currency shown in the app (for example USD) is a converted estimate for reference only and is not the amount charged.</p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">5. Data retention</h2>
          <p>
            We retain your account data for as long as your account is active.
            If you delete your account, we delete or anonymise your personal
            data within <strong>30 days</strong>, except where we are required
            to retain certain records (for example, billing and tax records
            related to payment transactions kept for up to{' '}
            <strong>7 years</strong> as required by law). Backups containing
            residual data are rotated and overwritten within{' '}
            <strong>90 days</strong>. If you enable Google Drive diary sync, the
            copy in your Google Drive is controlled by your Google account and is
            not part of our server backup-retention cycle. Turning sync off stops
            future Drive updates but does not automatically erase the copy already
            stored in your Google Drive application data.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">6. Storage & security</h2>
          <p>
            Data is encrypted in transit (TLS) and at rest. Database access is
            protected by row-level security and account permissions. Private
            journal data additionally requires server-verified PIN access;
            community content you choose to share is visible according to its
            sharing settings. We apply appropriate technical and organisational measures
            to protect your data against unauthorised access, alteration or
            loss.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">7. International transfers</h2>
          <p>
            Some of our service providers (including Paystack, Google and AI
            model providers) may process data outside your country of residence,
            including in Nigeria, the EEA, UK, South Africa and USA. Where
            required, we rely on adequacy decisions or Standard Contractual
            Clauses to safeguard those transfers.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">8. Your rights</h2>
          <p>
            Depending on your jurisdiction, you have the right to access,
            rectify, erase, restrict or object to processing of your personal
            data, the right to data portability, and the right to withdraw
            consent. You also have the right to lodge a complaint with your
            local data protection authority. You can export or delete your
            data at any time from <span className="font-semibold">Profile →
            Security &amp; Privacy</span> (which offers both Export Data and
            Delete Account), or download a copy of your progress from{' '}
            <span className="font-semibold">Profile → Backup &amp; Restore</span>.
            If you enabled Google Drive diary sync, you can also manage or remove
            HabTastic's stored app data through your Google Drive account settings.
            You can also email{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a>. We respond within one month.
          </p>
          <p className="mt-2">
            You can also permanently delete your HabTastic AI account and
            associated personal data from our public{' '}
            <a href="/delete-account" className="text-primary underline font-semibold">
              Account &amp; Data Deletion page
            </a>{' '}
            at{' '}
            <span className="font-semibold">habtastic.com/delete-account</span>,
            which is reachable whether or not you are signed in. Deletion follows
            the retention periods described in section 5.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">9. Cookies & local storage</h2>
          <p>
            We use local storage to remember preferences such as theme and sound,
            and platform-appropriate storage for your authentication session.
            Journal PIN verification is handled on the server.
            Paystack may set cookies on its checkout pages to process your
            payment and prevent fraud.
          </p>
          <p className="mt-2">
            <strong>Advertising in the native app:</strong> Eligible Free users
            may see ads through Google AdMob. AdMob may use the device advertising
            identifier and ad interaction data. Where required, the native app
            uses Google User Messaging Platform (UMP) privacy/consent controls.
          </p>
          <p className="mt-2">
            <strong>Advertising on the website/PWA:</strong> Eligible Free users
            may see ads through Google AdSense. AdSense may use cookies or similar
            browser identifiers and ad interaction data to deliver, limit and
            measure advertising. Google privacy and consent requirements apply in
            jurisdictions where consent is required.
          </p>
          <p className="mt-2">
            Premium subscribers and users in an active Premium trial are ad-free.
            Signed-out visitors are not deliberately enrolled in the in-app Free
            tier advertising flow. You can manage Google ad personalization at{' '}
            <a
              href="https://adssettings.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              adssettings.google.com
            </a>.
          </p>
          <p className="mt-2">
            If a product analytics tag (such as Google Analytics) is enabled on
            our website, it receives anonymous usage events only — never your
            habit, journal or payment data. You can change this browser's
            analytics preference here or, when signed in, under Security &amp;
            Privacy → Usage Analytics.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const next = !analyticsEnabled;
                setUsageAnalyticsEnabled(next);
                setAnalyticsEnabled(next);
              }}
            >
              {analyticsEnabled ? 'Disable anonymous usage analytics' : 'Enable anonymous usage analytics'}
            </Button>
            <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
              Current setting: {analyticsEnabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">10. Changes</h2>
          <p>
            If we update this policy we'll notify you in-app. Continued use of
            HabTastic AI after an update means you accept the new terms.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-h3 text-foreground mb-2">11. Contact</h2>
          <p>
            Questions? Reach {SELLER_NAME} at{' '}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline">
              {ADMIN_EMAIL}
            </a> or{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
              {SUPPORT_EMAIL}
            </a>.
          </p>
        </section>
      </div>

      <PublicFooter />
    </motion.div>
  );
}
