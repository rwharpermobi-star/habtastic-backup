import { useState, memo, useCallback } from 'react';
import { Check, Flame } from 'lucide-react';
import { formatLocalDate, todayStr } from '@/lib/habitStore';

interface HabitCardProps {
  habit: {
    id: string;
    name: string;
    emoji: string;
    category: string;
    frequency: string;
    completions: string[];
    reminderTime?: string;
    reminder_time?: string | null;
  };
  onToggle: (id: string) => void;
  index: number;
}

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0;
  let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatLocalDate(d);
    if (completions.includes(ds)) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function flameClasses(streak: number) {
  // Tiered animated flames — subtle at low streaks, roaring at 30+
  if (streak >= 30) {
    return {
      wrap: 'text-[#F97316] bg-gradient-to-br from-[#F97316]/20 to-[#DC2626]/20 rounded-full px-2 py-1 animate-flame-roar',
      icon: 'animate-flame-breathe drop-shadow-[0_0_6px_rgba(249,115,22,0.7)]',
    };
  }
  if (streak >= 7) {
    return {
      wrap: 'text-primary bg-primary/10 rounded-full px-2 py-1 animate-streak-glow',
      icon: 'animate-flame-breathe',
    };
  }
  if (streak >= 3) {
    return {
      wrap: 'text-primary',
      icon: 'animate-flame-breathe',
    };
  }
  return { wrap: 'text-primary', icon: '' };
}

const HabitCard = memo(function HabitCard({ habit, onToggle, index }: HabitCardProps) {
  const today = todayStr();
  const completed = habit.completions.includes(today);
  const streak = getStreak(habit.completions);
  const reminder = habit.reminderTime || habit.reminder_time;
  const [justCompleted, setJustCompleted] = useState(false);
  const flame = flameClasses(streak);

  const handleToggle = useCallback(() => {
    if (!completed) {
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 600);
    }
    onToggle(habit.id);
  }, [completed, onToggle, habit.id]);

  return (
    <div
      className={`glass rounded-card p-4 flex items-center gap-4 transition-all duration-200 animate-fade-in-up shadow-card relative overflow-hidden ${
        completed ? 'border-primary/30' : ''
      } ${justCompleted ? 'animate-success-burst' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {justCompleted && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-[#16A34A]/25 animate-ripple-success" />
        </div>
      )}

      <button
        onClick={handleToggle}
        className={`w-12 h-12 rounded-btn flex items-center justify-center text-xl transition-all duration-200 shrink-0 active:scale-[0.88] relative ${
           completed
            ? 'gradient-primary text-white animate-check-bounce'
            : 'bg-secondary hover:bg-secondary/80'
        }`}
      >
        {completed ? <Check className="w-5 h-5" /> : habit.emoji}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-body-lg truncate ${completed ? 'text-primary' : 'text-foreground'}`}>
          {habit.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-caption text-muted-foreground capitalize px-1.5 py-0.5 bg-secondary rounded-sm">{habit.category}</span>
          <span className="text-caption text-muted-foreground capitalize">{habit.frequency}</span>
          {reminder && <span className="text-caption text-muted-foreground">⏰ {reminder}</span>}
        </div>
      </div>

      {streak > 0 && (
        <div className={`flex items-center gap-1 shrink-0 ${flame.wrap}`}>
          <Flame className={`w-4 h-4 ${flame.icon}`} />
          <span className="text-body font-bold">{streak}</span>
        </div>
      )}

      {justCompleted && (
        <div className="absolute top-2 right-12 flex gap-1 pointer-events-none">
          <span className="text-warning font-bold text-caption animate-xp-pop">+XP</span>
          <span className="text-[#FFD93D] font-bold text-caption animate-xp-pop" style={{ animationDelay: '0.1s' }}>+5🪙</span>
        </div>
      )}
    </div>
  );
});

export default HabitCard;
