import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
}

export interface EmptyStateProps {
  /** Winston-style illustration. Emoji, lucide icon, or custom node. Default: 🦁 */
  illustration?: ReactNode;
  /** Big motivating headline. */
  title: string;
  /** Winston's short helpful description. Displayed as a spoken line. */
  message: string;
  /** Primary CTA — the ONE action we want the user to take. */
  primary?: EmptyStateAction;
  /** Optional secondary CTA. */
  secondary?: EmptyStateAction;
  /** Override CTAs entirely with a custom node (e.g. an existing Dialog trigger). */
  actionsSlot?: ReactNode;
  /** Optional accent tone for the illustration halo. */
  tone?: 'primary' | 'accent' | 'success' | 'warning';
  className?: string;
}

const TONE_HALO: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  primary: 'from-primary/25 via-secondary/20 to-transparent',
  accent:  'from-accent/25 via-warning/15 to-transparent',
  success: 'from-success/25 via-primary/15 to-transparent',
  warning: 'from-warning/25 via-accent/15 to-transparent',
};

/**
 * Unified empty-state pattern for HabTastic AI.
 *
 * Every empty screen in the app should render <EmptyState> so users always see:
 *   • a friendly Winston-style illustration
 *   • an encouraging headline
 *   • a short spoken message from Winston
 *   • one clear primary action
 *   • an optional secondary action
 *
 * Presentation-only: consumers still own routing and data mutation.
 */
export default function EmptyState({
  illustration = '🦁',
  title,
  message,
  primary,
  secondary,
  actionsSlot,
  tone = 'primary',
  className,
}: EmptyStateProps) {
  const renderAction = (a: EmptyStateAction, variant: 'default' | 'outline') => {
    const content = (
      <span className="inline-flex items-center gap-2">
        {a.icon}
        <span>{a.label}</span>
      </span>
    );
    if (a.href) {
      return (
        <Button asChild variant={variant} size="lg" className={variant === 'default' ? 'min-w-[220px]' : ''}>
          <a href={a.href}>{content}</a>
        </Button>
      );
    }
    return (
      <Button
        variant={variant}
        size="lg"
        onClick={a.onClick}
        className={variant === 'default' ? 'min-w-[220px]' : ''}
      >
        {content}
      </Button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'glass rounded-card p-8 sm:p-10 text-center shadow-card overflow-hidden relative',
        className,
      )}
    >
      {/* Ambient halo */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 -z-0 bg-gradient-radial opacity-70',
          'bg-gradient-to-b',
          TONE_HALO[tone],
        )}
      />

      {/* Winston / illustration — floating */}
      <div className="relative z-[1] flex justify-center mb-4">
        <div className="relative">
          {/* soft halo */}
          <motion.span
            aria-hidden
            className="absolute inset-0 -m-4 rounded-full bg-primary/20 blur-xl"
            animate={{ opacity: [0.3, 0.55, 0.3], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="relative text-6xl sm:text-7xl leading-none select-none"
            aria-hidden
            animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {illustration}
          </motion.div>
        </div>
      </div>

      {/* Headline */}
      <motion.h3
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative z-[1] text-h3 font-display text-foreground"
      >
        {title}
      </motion.h3>

      {/* Winston "speech" line */}
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="relative z-[1] mt-2 mx-auto max-w-sm text-body text-muted-foreground leading-relaxed"
      >
        <span className="italic">"{message}"</span>
        <span className="block text-eyebrow mt-2">— Winston</span>
      </motion.p>

      {/* CTAs */}
      {(actionsSlot || primary || secondary) && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="relative z-[1] mt-6 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          {actionsSlot ?? (
            <>
              {primary  && renderAction(primary,  'default')}
              {secondary && renderAction(secondary, 'outline')}
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
