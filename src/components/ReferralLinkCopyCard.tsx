import { PRODUCTION_WEB_ORIGIN } from '@/lib/appOrigin';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link2, Copy, Check, Sparkles, Gift, Zap, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  referralCode: string | null;
  userName?: string | null;
}

export default function ReferralLinkCopyCard({ referralCode, userName }: Props) {
  const [copied, setCopied] = useState(false);
  const link = referralCode
    ? `${PRODUCTION_WEB_ORIGIN}/?ref=${referralCode}`
    : PRODUCTION_WEB_ORIGIN;

  const copy = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Referral link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="glass rounded-card p-5 mb-6 shadow-card"
    >
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-h3 text-foreground">Your Referral Link</h3>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 bg-secondary/60 rounded-input px-3 py-2.5 text-caption text-foreground truncate font-mono">
          {link}
        </div>
        <Button
          onClick={copy}
          disabled={!referralCode}
          className="rounded-btn h-10 px-4 gap-1.5"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Preview: how signup will look
        </p>
        <div className="rounded-card border border-primary/30 bg-gradient-to-br from-primary/10 via-accent/5 to-background p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full gradient-orange flex items-center justify-center text-white flex-shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-caption font-semibold text-foreground">
                🎉 Invited by <span className="text-primary">{userName || 'you'}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mb-2">
                Code <span className="font-mono font-bold text-foreground">{referralCode || '——————'}</span>{' '}
                will be pre-filled at signup.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                  <Zap className="w-2.5 h-2.5" /> Configurable XP bonuses
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                  <Crown className="w-2.5 h-2.5" /> Verified Premium milestones
                </span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3 leading-snug">
            Your friend lands on <span className="font-mono">habtastic.com</span>, signs up, and the code auto-applies.
            A verified paid Premium purchase counts toward the currently configured referral milestones. Referral codes are only for new accounts and never create friendships.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
