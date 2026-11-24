import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useHabits } from '@/hooks/useHabits';
import { useProfile } from '@/hooks/useProfile';
import { getLevelFromXP, getStreak } from '@/lib/habitStore';
import { playLevelUp } from '@/lib/sfx';
import { vibrateSuccess } from '@/lib/haptics';

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

const STORAGE_KEY = 'habtastic-achievements-unlocked';

type UnlockMap = Record<string, string>; // id -> ISO timestamp

function loadUnlocks(): UnlockMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveUnlocks(map: UnlockMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore: best effort */ }
}

export function useAchievements(): { achievements: Achievement[]; unlockedCount: number } {
  const { habits } = useHabits();
  const { profile } = useProfile();
  const xp = profile?.xp ?? 0;
  const { level } = getLevelFromXP(xp);
  const totalCompletions = habits.reduce((s, h) => s + h.completions.length, 0);
  const maxStreak = habits.reduce((m, h) => Math.max(m, getStreak(h as any)), 0);

  // Note: 'Founder' is always unlocked as an early-supporter badge.
  const definitions = useMemo(() => ([
    { id: 'founder',      icon: '🏅', title: 'Founder',      desc: 'Early supporter badge',    unlocked: true },
    { id: 'first_step',   icon: '🌱', title: 'First Step',   desc: 'Create your first habit',  unlocked: habits.length > 0 },
    { id: 'on_fire',      icon: '🔥', title: 'On Fire',      desc: 'Complete 10 habit checks', unlocked: totalCompletions >= 10 },
    { id: 'leveling_up',  icon: '⚡', title: 'Leveling Up',  desc: 'Reach Level 3',            unlocked: level >= 3 },
    { id: 'champion',     icon: '🏆', title: 'Champion',     desc: 'Reach Level 5',            unlocked: level >= 5 },
    { id: 'diamond',      icon: '💎', title: 'Diamond',      desc: 'Complete 100 checks',      unlocked: totalCompletions >= 100 },
    { id: 'legend',       icon: '👑', title: 'Legend',       desc: 'Reach Level 10',           unlocked: level >= 10 },
    // Streak-based badges — unlock as users maintain daily habit streaks
    { id: 'streak_3',     icon: '🌿', title: 'Sprout',       desc: '3-day streak',             unlocked: maxStreak >= 3 },
    { id: 'streak_7',     icon: '🔥', title: 'Week Warrior', desc: '7-day streak',             unlocked: maxStreak >= 7 },
    { id: 'streak_14',    icon: '⚡', title: 'Fortnight',    desc: '14-day streak',            unlocked: maxStreak >= 14 },
    { id: 'streak_30',    icon: '🏅', title: 'Monthly Master', desc: '30-day streak',          unlocked: maxStreak >= 30 },
    { id: 'streak_60',    icon: '🚀', title: 'Unstoppable',  desc: '60-day streak',            unlocked: maxStreak >= 60 },
    { id: 'streak_100',   icon: '💎', title: 'Centurion',    desc: '100-day streak',           unlocked: maxStreak >= 100 },
    { id: 'streak_365',   icon: '👑', title: 'Year of Iron', desc: '365-day streak',           unlocked: maxStreak >= 365 },
  ]), [habits.length, totalCompletions, level, maxStreak]);

  // Persist unlocks + celebrate first-time unlocks.
  const initialised = useRef(false);
  const achievements: Achievement[] = useMemo(() => {
    const stored = loadUnlocks();
    let dirty = false;
    const result = definitions.map(d => {
      if (d.unlocked && !stored[d.id]) {
        stored[d.id] = new Date().toISOString();
        dirty = true;
        // Celebrate only after the initial sync (avoid spamming on first load)
        if (initialised.current) {
          toast.success(`Achievement unlocked: ${d.title}`, {
            description: `${d.icon} ${d.desc}`,
            duration: 6000,
          });
          playLevelUp();
          vibrateSuccess();
        }
      }
      return {
        id: d.id,
        icon: d.icon,
        title: d.title,
        desc: d.desc,
        unlocked: d.unlocked,
        unlockedAt: stored[d.id] ?? null,
      };
    });
    if (dirty) saveUnlocks(stored);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitions]);

  useEffect(() => {
    // Mark initial sync done after first render so future unlocks celebrate.
    const t = setTimeout(() => { initialised.current = true; }, 1500);
    return () => clearTimeout(t);
  }, []);

  return {
    achievements,
    unlockedCount: achievements.filter(a => a.unlocked).length,
  };
}
