import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Check, X, Zap, Loader2 } from 'lucide-react';
import { WinstonChallenge } from '@/hooks/useWinstonChallenges';

interface Props {
  challenge: WinstonChallenge | undefined;
  generating: boolean;
  onGenerate: () => void;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onComplete: (id: string) => void;
}

const DIFF_STYLES: Record<string, string> = {
  easy: 'bg-success/15 text-success border-success/30',
  medium: 'bg-accent/15 text-accent border-accent/30',
  hard: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function WinstonChallengeCard({ challenge, generating, onGenerate, onAccept, onDecline, onComplete }: Props) {
  // No active challenge — show CTA
  if (!challenge) {
    return (
      <motion.button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        whileTap={{ scale: 0.97 }}
        className="w-full rounded-2xl px-4 py-3.5 bg-gradient-to-br from-accent/15 via-accent/8 to-transparent border border-accent/25 backdrop-blur-sm flex items-center justify-between gap-3 disabled:opacity-60"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
            {generating ? (
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
            ) : (
              <Swords className="w-5 h-5 text-accent" />
            )}
          </div>
          <div>
            <p className="font-bold text-body text-foreground leading-tight">
              {generating ? 'Cooking up a challenge…' : 'Challenge Me'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {generating ? 'One sec.' : 'Get a micro-mission from Winston.'}
            </p>
          </div>
        </div>
        {!generating && <Zap className="w-4 h-4 text-accent" />}
      </motion.button>
    );
  }

  const isPending = challenge.status === 'pending';
  const isAccepted = challenge.status === 'accepted';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={challenge.id}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="rounded-2xl px-4 py-3.5 bg-gradient-to-br from-accent/12 via-card to-secondary/30 border border-accent/25 backdrop-blur-sm"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
            <Swords className="w-4.5 h-4.5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${DIFF_STYLES[challenge.difficulty]}`}>
                {challenge.difficulty}
              </span>
              <span className="flex items-center gap-0.5 text-[11px] text-accent font-semibold">
                <Zap className="w-3 h-3" /> +{challenge.reward_xp} XP
              </span>
            </div>
            <p className="font-bold text-body text-foreground leading-tight">{challenge.title}</p>
            <p className="text-caption text-muted-foreground mt-1 leading-relaxed">{challenge.description}</p>

            <div className="flex items-center gap-2 mt-3">
              {isPending && (
                <>
                  <button
                    onClick={() => onAccept(challenge.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button
                    onClick={() => onDecline(challenge.id)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-semibold bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Skip
                  </button>
                </>
              )}
              {isAccepted && (
                <button
                  onClick={() => onComplete(challenge.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-caption font-semibold gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <Check className="w-3.5 h-3.5" /> Mark done
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
