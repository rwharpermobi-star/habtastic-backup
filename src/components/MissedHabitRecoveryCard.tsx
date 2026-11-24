import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LifeBuoy, RotateCcw, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMissedHabits } from '@/hooks/useMissedHabits';
import { useStreakFreeze } from '@/hooks/useStreakFreeze';
import { useHabits } from '@/hooks/useHabits';
import { todayStr } from '@/lib/habitStore';
import { toast } from 'sonner';

const SUPPORTIVE_MESSAGES = [
  "One missed day doesn't break progress. Ready to get back on track?",
  "Yesterday is behind you. Today's a clean slate.",
  "Even pros miss a day. What matters is the next rep.",
  "Small reset, big comeback. You've got this.",
];

function pickMessage(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SUPPORTIVE_MESSAGES[h % SUPPORTIVE_MESSAGES.length];
}

export default function MissedHabitRecoveryCard() {
  const navigate = useNavigate();
  const { missed } = useMissedHabits();
  const { toggleCompletion } = useHabits();
  const { useFreeze: applyStreakFreeze, canFreeze } = useStreakFreeze();

  if (missed.length === 0) return null;
  const first = missed[0];
  const message = pickMessage(first.missedDate + first.habit.id);

  const handleStartToday = async () => {
    const today = todayStr();
    if (first.habit.completions.includes(today)) {
      toast('Already complete for today — nice.');
      return;
    }
    const completed = await toggleCompletion(first.habit.id, { silent: true });
    if (completed === true) {
      toast.success(`✨ ${first.habit.name} marked for today.`);
    } else {
      toast.error('Could not save the habit completion. Please try again.');
    }
  };

  const handleStreakSaver = async () => {
    if (!canFreeze) {
      toast.error('No Streak Saver available right now.');
      return;
    }
    await applyStreakFreeze();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl px-4 py-4 bg-gradient-to-br from-warning/12 via-warning/6 to-transparent border border-warning/25"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <LifeBuoy className="w-4 h-4 text-warning" />
        <p className="text-caption font-semibold text-warning">Missed yesterday · Winston has your back</p>
      </div>
      <p className="text-body font-medium text-foreground leading-snug mb-1">
        {first.habit.emoji} {first.habit.name}
        {missed.length > 1 && (
          <span className="text-muted-foreground font-normal"> +{missed.length - 1} more</span>
        )}
      </p>
      <p className="text-caption text-muted-foreground mb-3">{message}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate('/habits')} className="text-[11px]">
          <ArrowRight className="w-3 h-3 mr-1" /> Reschedule
        </Button>
        <Button size="sm" variant="outline" onClick={handleStreakSaver} className="text-[11px]">
          <Shield className="w-3 h-3 mr-1" /> Streak Saver
        </Button>
        <Button size="sm" onClick={handleStartToday} className="gradient-primary text-white text-[11px]">
          <RotateCcw className="w-3 h-3 mr-1" /> Today
        </Button>
      </div>
    </motion.div>
  );
}
