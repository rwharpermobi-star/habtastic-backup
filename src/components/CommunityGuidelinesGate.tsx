import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCommunityTerms } from '@/hooks/useCommunityTerms';

const PROHIBITED = [
  'Illegal content or activity',
  'Hate speech or harassment',
  'Threats, violence or self-harm encouragement',
  'Sexual, exploitative or child-endangering content',
  'Spam, scams or misleading promotions',
  'Impersonation of other people or brands',
  'Privacy violations (sharing others’ personal data)',
  'Any other abusive or objectionable content',
];

/**
 * Reusable acceptance gate. Renders `children` only once the signed-in user
 * has accepted the community rules (stored in Supabase user metadata).
 */
export default function CommunityGuidelinesGate({ children }: { children: ReactNode }) {
  const { accepted, accept, saving } = useCommunityTerms();
  const [checked, setChecked] = useState(false);

  if (accepted) return <>{children}</>;

  const handleAccept = async () => {
    const ok = await accept();
    if (ok) toast.success('Thanks — welcome to the community 🤝');
    else toast.error('Could not save your acceptance. Please try again.');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-card p-5 border border-primary/15"
    >
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="w-5 h-5 text-primary" />
        <h2 className="text-h3 font-semibold text-foreground">Community rules</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Before posting, commenting or reacting, please accept our community
        rules for user-generated content.
      </p>

      <p className="text-xs font-semibold text-foreground mb-1">Not allowed:</p>
      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1 mb-3">
        {PROHIBITED.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground mb-3">
        Content that breaks these rules may be removed and accounts may be
        restricted, suspended or terminated. You can report, mute or block other
        members at any time using the menu on any post or comment. Full details
        are in our{' '}
        <Link to="/terms" className="text-primary underline">
          Terms of Service
        </Link>
        .
      </p>

      <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => setChecked(v === true)}
          aria-label="I agree to the community rules"
          className="mt-0.5"
        />
        <span className="text-xs text-foreground">
          I have read and agree to the community rules and Terms of Service, and
          I will not post prohibited content.
        </span>
      </label>

      <Button
        onClick={handleAccept}
        disabled={!checked || saving}
        className="w-full gradient-primary text-primary-foreground rounded-btn h-11"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…
          </>
        ) : (
          'Accept & Continue'
        )}
      </Button>
    </motion.div>
  );
}
