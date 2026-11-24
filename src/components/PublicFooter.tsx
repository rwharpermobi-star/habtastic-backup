import { Link } from 'react-router-dom';
import { shouldUsePlayBilling } from '@/lib/googlePlayBilling';
import { ADMIN_EMAIL, SUPPORT_EMAIL } from '@/lib/contactEmails';

export default function PublicFooter() {
  const isPlay = shouldUsePlayBilling();
  return (
    <footer className="w-full mt-10 border-t border-border/60 pt-6 pb-8 px-5">
      <p className="text-center text-sm font-semibold mb-4">HabTastic AI</p>
      <nav
        aria-label="Legal"
        className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
      >
        <Link to="/pricing" className="hover:text-foreground transition-colors">
          Pricing
        </Link>
        <Link to="/contact" className="hover:text-foreground transition-colors">
          Contact Us
        </Link>
        <Link to="/privacy" className="hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-foreground transition-colors">
          Terms of Service
        </Link>
        <Link to="/refund-policy" className="hover:text-foreground transition-colors">
          Refund Policy
        </Link>
        <Link to="/cancellation" className="hover:text-foreground transition-colors">
          Cancellation
        </Link>
      </nav>

      <div className="mt-4 flex justify-center">
        <a
          href="https://github.com/sponsors/rwharpermobi-star"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border/70 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ❤️ Support HabTastic
        </a>
      </div>

      <p className="text-center text-[11px] text-muted-foreground/80 mt-4 max-w-md mx-auto leading-relaxed">
        General, billing &amp; business enquiries:{' '}
        <a href={`mailto:${ADMIN_EMAIL}`} className="underline hover:text-foreground">
          {ADMIN_EMAIL}
        </a>
      </p>
      <p className="text-center text-[11px] text-muted-foreground/80 mt-1 max-w-md mx-auto leading-relaxed">
        Technical &amp; account support:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-foreground">
          {SUPPORT_EMAIL}
        </a>
      </p>

      <p className="text-center text-[11px] text-muted-foreground/80 mt-2 max-w-md mx-auto leading-relaxed">
        {isPlay ? (
          <>Android subscriptions are processed securely by Google Play. Manage or cancel them in Google Play subscriptions.</>
        ) : (
          <>
            Payments are processed securely by{' '}
            <a href="https://paystack.com" target="_blank" rel="noopener noreferrer"
              className="underline hover:text-foreground">
              Paystack
            </a>
            . Cancel your subscription anytime from Settings.
          </>
        )}
      </p>
    </footer>
  );
}
