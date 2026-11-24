import { motion } from 'framer-motion';
import { usePageMeta } from '@/lib/usePageMeta';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, MessageSquare, MapPin, Briefcase } from 'lucide-react';
import PublicFooter from '@/components/PublicFooter';
import { ADMIN_EMAIL, SUPPORT_EMAIL, SELLER_NAME } from '@/lib/contactEmails';


export default function Contact() {
  usePageMeta({
    title: 'Contact HabTastic AI Support',
    description: 'Get in touch with the HabTastic AI team for support with habits, billing, subscriptions or your account.',
    canonicalPath: '/contact',
  });

  const navigate = useNavigate();
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
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        <h1 className="text-h1 text-foreground">Contact Us</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        We're happy to help with anything related to {SELLER_NAME}.
      </p>

      <section className="space-y-4 text-foreground/90 text-[15px] leading-relaxed">
        <div className="rounded-xl border border-border p-4 flex items-start gap-3">
          <Briefcase className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="font-semibold">General &amp; Billing Enquiries</p>
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary underline text-sm">
              {ADMIN_EMAIL}
            </a>
            <p className="text-xs text-muted-foreground mt-1">
              Billing, subscriptions, refunds, general questions, business and administration enquiries.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="font-semibold">Technical Support</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline text-sm">
              {SUPPORT_EMAIL}
            </a>
            <p className="text-xs text-muted-foreground mt-1">
              App errors, bugs, technical problems, login and password help. Response within 2 business days.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 flex items-start gap-3">
          <MapPin className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <p className="font-semibold">Business</p>
            <p className="text-sm">{SELLER_NAME}</p>
            <p className="text-sm text-muted-foreground">South Africa</p>
          </div>
        </div>
      </section>

      <PublicFooter />
    </motion.div>
  );
}
