import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePremium } from '@/hooks/usePremium';
import PremiumBadge from '@/components/PremiumBadge';

interface LockedFeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  ctaText?: string;
}

export default function LockedFeatureCard({ title, description, icon, children, ctaText }: LockedFeatureCardProps) {
  const navigate = useNavigate();
  const { trialExpired, premiumProgressLocked } = usePremium();
  const defaultCta = trialExpired ? "Unlock with Premium to continue" : "Unlock Now";
  const lockedDescription = trialExpired
    ? `${description} Your saved progress is still here and will unlock again when Premium is active.`
    : description;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-card overflow-hidden border border-border bg-card/50"
    >
      {/* Premium badge corner */}
      <div className="absolute top-3 right-3 z-10">
        <PremiumBadge size="xs" variant="solid" />
      </div>

      {/* Blurred content preview */}
      <div className={`pointer-events-none select-none p-5 ${premiumProgressLocked ? 'grayscale opacity-45' : 'blur-[3px] opacity-40'}`}>
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-[2px]">
        <motion.div
          className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mb-3 glow-primary"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Lock className="w-6 h-6 text-white" />
        </motion.div>
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <h3 className="font-bold text-body-lg text-foreground font-display">{title}</h3>
        </div>
        <p className="text-caption text-muted-foreground text-center px-8 mb-4">{lockedDescription}</p>
        <button
          onClick={() => navigate('/pricing')}
          className="px-6 py-2.5 gradient-primary text-white rounded-btn font-semibold text-sm shadow-lg glow-primary font-display flex items-center gap-2"
        >
          {ctaText || defaultCta} 🔓
        </button>
      </div>
    </motion.div>
  );
}
