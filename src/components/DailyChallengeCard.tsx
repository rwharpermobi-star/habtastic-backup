import { motion, AnimatePresence } from 'framer-motion';
import { Target, Flame, Trophy, Zap, ArrowRight } from 'lucide-react';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';

export default function DailyChallengeCard() {
  const { template, status, progress, target, ratio, hydrated, accept } = useDailyChallenge();
  const previousStatusRef = useRef<typeof status | null>(null);
  const initializedRef = useRef(false);

  // Celebrate only the live transition into completed, never when reopening the app.
  useEffect(() => {
    if (!hydrated) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      previousStatusRef.current = status;
      return;
    }

    const wasCompleted = previousStatusRef.current === 'completed';
    previousStatusRef.current = status;

    if (status === 'completed' && !wasCompleted) {
      try { (navigator)?.vibrate?.([15, 60, 30, 60, 15]); } catch { /* ignore: best effort */ }
      toast.success(`🏆 Challenge completed — +${template.rewardXp} XP`, {
        description: template.completionLine,
        duration: 5000,
      });
    }
  }, [hydrated, status, template.rewardXp, template.completionLine]);

  if (!hydrated) {
    return (
      <div className="rounded-2xl px-4 py-4 border border-border/20 bg-secondary/30 animate-pulse h-[120px]" />
    );
  }

  // ─── PENDING ──────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl px-4 py-4 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent border border-primary/25 backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-2xl">
            {template.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Winston's Challenge
              </span>
              <span className="flex items-center gap-0.5 text-[11px] text-primary font-semibold">
                <Zap className="w-3 h-3" /> +{template.rewardXp} XP
              </span>
            </div>
            <p className="font-bold text-body text-foreground leading-tight">
              {template.title}
            </p>
            <p className="text-caption text-muted-foreground mt-1 leading-relaxed">
              "{template.description}"
            </p>
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            try { (navigator)?.vibrate?.(15); } catch { /* ignore: best effort */ }
            accept();
          }}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground font-bold text-caption hover:brightness-110 transition-all"
        >
          <Target className="w-4 h-4" /> Accept Challenge <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
      </motion.div>
    );
  }

  // ─── ACTIVE (with progress) ───────────────────────────────
  if (status === 'active') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl px-4 py-4 bg-gradient-to-br from-accent/12 via-card to-secondary/30 border border-accent/30 backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/20 flex items-center justify-center shrink-0 relative">
            <Flame className="w-5 h-5 text-accent" />
            <motion.span
              className="absolute inset-0 rounded-xl border-2 border-accent/40"
              animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                🔥 Challenge Active
              </span>
              <span className="flex items-center gap-0.5 text-[11px] text-accent font-semibold">
                <Zap className="w-3 h-3" /> +{template.rewardXp} XP
              </span>
            </div>
            <p className="font-bold text-body text-foreground leading-tight">
              {template.title}
            </p>
            <p className="text-caption text-muted-foreground mt-1 leading-relaxed italic">
              "{template.livePrompt}"
            </p>

            {/* Progress bar */}
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground/80 font-semibold">
                  Progress: {progress} / {target} {template.unitLabel(target)}
                </span>
                <span className="text-accent font-bold">
                  {Math.round(ratio * 100)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, ratio * 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
              <p className="text-[10.5px] text-muted-foreground italic">
                Don't break it now.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── COMPLETED ────────────────────────────────────────────
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl px-4 py-4 bg-gradient-to-br from-success/20 via-success/8 to-transparent border border-success/35 backdrop-blur-sm relative overflow-hidden"
    >
      {/* Confetti shimmer */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        style={{
          background:
            'linear-gradient(90deg, transparent, hsl(var(--success) / 0.18), transparent)',
        }}
      />
      <div className="flex items-start gap-3 relative">
        <motion.div
          initial={{ rotate: -15, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          className="w-11 h-11 rounded-xl bg-success/25 flex items-center justify-center shrink-0"
        >
          <Trophy className="w-5 h-5 text-success" />
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-success">
              🏆 Challenge Completed
            </span>
            <span className="flex items-center gap-0.5 text-[11px] text-success font-semibold">
              <Zap className="w-3 h-3" /> +{template.rewardXp} XP
            </span>
          </div>
          <p className="font-bold text-body text-foreground leading-tight">
            {template.title}
          </p>
          <p className="text-caption text-muted-foreground mt-1 leading-relaxed italic">
            — Winston: "{template.completionLine}"
          </p>
          <p className="text-[10.5px] text-muted-foreground mt-2">
            Fresh challenge tomorrow. Same time.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

