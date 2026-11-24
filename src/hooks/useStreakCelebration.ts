import { useEffect, useRef, useState, useCallback } from 'react';
import { useConfetti } from '@/hooks/useConfetti';
import { toast } from 'sonner';
import { playStreakFanfare } from '@/lib/sfx';

const MILESTONES = [3, 5, 7, 14, 21, 30, 50, 100];

const CELEBRATIONS: Record<string, { male: string; female: string; emoji: string }> = {
  '3': {
    male: "3 days in. Momentum is building. Don't stop now.",
    female: "3 days strong! You're already creating a habit! 🌱",
    emoji: '🌱',
  },
  '5': {
    male: "5 days. You're proving this isn't a fluke. Solid work.",
    female: "5 days! You're on fire — this is becoming part of who you are! ✨",
    emoji: '✨',
  },
  '7': {
    male: "7 days straight. That's how winners are built. Keep going.",
    female: "Look at you go! 7 days of consistency — that's everything! 🎉",
    emoji: '🔥',
  },
  '14': {
    male: "Two weeks of discipline. You're forging an unbreakable chain. Respect.",
    female: "14 days! You're building something truly amazing. I'm so proud of you! 💪",
    emoji: '⚡',
  },
  '21': {
    male: "21 days. Science says it takes this long to form a habit. You did it.",
    female: "21 days — they say it takes this long to build a habit. You just did! 🧠",
    emoji: '🧠',
  },
  '30': {
    male: "30 days. A full month of showing up. That takes real character. You earned this.",
    female: "One whole month! You've proven you can do anything you set your mind to! 🏆",
    emoji: '🏆',
  },
  '50': {
    male: "50 days. Half the people who start don't make it to 7. You're elite now.",
    female: "50 days of dedication! You're in the top tier now — absolutely incredible! 🌟",
    emoji: '🌟',
  },
  '100': {
    male: "100 days. You've become the person others look up to. This is mastery.",
    female: "100 days! You are literally unstoppable. This is legendary status! 👑",
    emoji: '👑',
  },
};

export interface MilestoneBadge {
  milestone: number;
  emoji: string;
  message: string;
}

export function useStreakCelebration(
  totalStreak: number,
  coachGender: 'male' | 'female' | null | undefined,
) {
  const celebratedRef = useRef<Set<number>>(new Set());
  const { fireConfetti } = useConfetti();
  const [activeBadge, setActiveBadge] = useState<MilestoneBadge | null>(null);

  const dismissBadge = useCallback(() => setActiveBadge(null), []);

  useEffect(() => {
    if (!totalStreak) return;

    const milestone = MILESTONES.find(m => totalStreak === m);
    if (!milestone || celebratedRef.current.has(milestone)) return;

    celebratedRef.current.add(milestone);
    const key = String(milestone);
    const celebration = CELEBRATIONS[key];
    if (!celebration) return;

    const gender = coachGender || 'female';
    const message = celebration[gender];

    // Routine streak milestones stay lightweight. Only genuinely large
    // milestones (30/50/100) interrupt the screen.
    const majorMilestone = milestone >= 30;

    if (majorMilestone) {
      fireConfetti();
      playStreakFanfare(true);
      setActiveBadge({ milestone, emoji: celebration.emoji, message });
    } else {
      toast.success(`${celebration.emoji} ${milestone}-Day Streak!`, {
        id: 'streak-compact',
        duration: 1800,
      });
    }

    // Voice fanfare is reserved for the same rare major milestones.
    if (majorMilestone && 'speechSynthesis' in window) {
      setTimeout(() => {
        const utter = new SpeechSynthesisUtterance(message);
        utter.rate = 0.95;
        window.speechSynthesis.speak(utter);
      }, 500);
    }
  }, [totalStreak, coachGender, fireConfetti]);

  return { activeBadge, dismissBadge };
}
