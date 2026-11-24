import { forwardRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Lock, Sparkles, Shield, Zap, Crown, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDailyChest, type ChestReward } from '@/hooks/useDailyChest';
import { useConfetti } from '@/hooks/useConfetti';
import { playCoinDrop } from '@/lib/sfx';
import { vibrateMedium } from '@/lib/haptics';
import { toast } from 'sonner';

interface Props {
  /** All due habits for today are completed */
  unlocked: boolean;
}

const REWARD_LABEL: Record<ChestReward['reward_type'], (v: number) => { icon: JSX.Element; title: string; sub: string }> = {
  // Coin economy temporarily disabled — coin chests render as a neutral bonus.
  coins: () => ({ icon: <Sparkles className="w-7 h-7" />, title: 'Daily Bonus', sub: 'Keep your streak going!' }),
  streak_shield: (v) => ({ icon: <Shield className="w-7 h-7" />, title: `${v}× Streak Shield`, sub: 'Protect your streak on a missed day' }),
  streak_saver: (v) => ({ icon: <LifeBuoy className="w-7 h-7" />, title: `${v}× Streak Saver`, sub: 'Restore a broken streak' }),
  double_xp_24h: () => ({ icon: <Zap className="w-7 h-7" />, title: 'Double XP · 24h', sub: 'Booster activates with the XP system' }),
  premium_day_pass: () => ({ icon: <Crown className="w-7 h-7" />, title: 'Premium Day Pass', sub: '24 hours of Premium added' }),
};

const DailyChestCard = forwardRef<HTMLDivElement, Props>(function DailyChestCard({ unlocked }, _ref) {
  const { todaysChest, opened, openChest, isLoading } = useDailyChest();
  const { fireConfetti } = useConfetti();
  const [opening, setOpening] = useState(false);
  const [revealed, setRevealed] = useState<ChestReward | null>(null);

  if (isLoading) return null;

  // A successful open is reflected immediately, even before React Query refreshes.
  const hasOpened = opened || !!revealed;
  const display = revealed ?? (opened && todaysChest
    ? { reward_type: todaysChest.reward_type, reward_value: todaysChest.reward_value }
    : null);

  const handleOpen = async () => {
    if (!unlocked || opening || hasOpened) return;
    setOpening(true);
    try {
      const reward = await openChest();
      setRevealed(reward);
      playCoinDrop();
      vibrateMedium();
      fireConfetti();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not open chest';
      if (msg.toLowerCase().includes('already opened')) {
        toast.info("You've already opened today's chest. Come back tomorrow.");
      } else {
        toast.error(msg);
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-accent/10 p-5 shadow-sm"
    >
      <div className="flex items-center gap-4">
        <motion.div
          animate={!hasOpened && unlocked ? { y: [0, -4, 0], rotate: [-2, 2, -2] } : {}}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-primary"
        >
          {hasOpened ? <Sparkles className="w-7 h-7" /> : unlocked ? <Gift className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
        </motion.div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold leading-tight">Daily Reward Chest</h3>
          <AnimatePresence mode="wait">
            {display ? (
              <motion.p
                key="reward"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-0.5 text-sm text-muted-foreground"
              >
                {hasOpened && (
                  <span className="block font-medium text-foreground">Opened today</span>
                )}
                <span className="font-medium text-foreground">
                  {REWARD_LABEL[display.reward_type](display.reward_value).title}
                </span>
                {' · '}
                {REWARD_LABEL[display.reward_type](display.reward_value).sub}
                {hasOpened && ' Come back tomorrow for your next chest.'}
              </motion.p>
            ) : (
              <motion.p
                key={unlocked ? 'unlocked' : 'locked'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-0.5 text-sm text-muted-foreground"
              >
                {unlocked
                  ? 'All habits done — tap to open your chest!'
                  : 'Complete all of today’s habits to unlock'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {!hasOpened && (
          <Button size="sm" disabled={!unlocked || opening} onClick={handleOpen}>
            {opening ? 'Opening…' : 'Open'}
          </Button>
        )}
      </div>
    </motion.div>
  );
});

export default DailyChestCard;
