import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Gift, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfetti } from '@/hooks/useConfetti';

export default function ReferralApplied() {
  const navigate = useNavigate();
  const [code, setCode] = useState<string>('');
  const { fireConfetti } = useConfetti();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCode((params.get('code') || '').toUpperCase());
    fireConfetti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background relative overflow-hidden">
      <div className="absolute top-[-15%] left-[-10%] w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-64 h-64 rounded-full bg-accent/15 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        className="relative z-10 w-full max-w-sm glass rounded-card p-7 text-center shadow-card"
      >
        <div className="w-20 h-20 mx-auto mb-4 rounded-full gradient-primary flex items-center justify-center glow-primary">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <p className="text-[11px] uppercase tracking-widest font-bold text-primary mb-1">
          Referral Applied
        </p>
        <h1 className="text-h1 font-bold text-foreground mb-2">You're in! 🎉</h1>
        <p className="text-body text-muted-foreground mb-5">
          Your new account is now linked to the person who invited you. Premium milestone rewards are counted only after a qualifying purchase is verified by HabTastic.
        </p>

        {code && (
          <div className="bg-secondary/60 rounded-input px-4 py-3 mb-5 font-mono text-body-lg font-bold tracking-wider text-foreground flex items-center justify-center gap-2">
            <Gift className="w-4 h-4 text-accent" />
            {code}
          </div>
        )}

        <div className="rounded-input bg-primary/10 border border-primary/20 p-3 mb-5 text-left flex gap-2">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-caption text-muted-foreground leading-snug">
            Any XP and reward-point bonuses are issued only when enabled by server configuration and verified by HabTastic. Referral codes cannot be used to claim signup rewards on existing accounts.
          </p>
        </div>

        <Button
          onClick={() => navigate('/', { replace: true })}
          className="w-full h-12 rounded-btn gradient-primary text-white font-semibold text-btn glow-primary"
        >
          Let's Go 🚀
        </Button>
      </motion.div>
    </div>
  );
}
