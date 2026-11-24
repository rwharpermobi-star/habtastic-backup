export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: 'daily' | 'weekly' | 'custom';
  category: 'health' | 'mindset' | 'work' | 'custom';
  difficulty: 'easy' | 'medium' | 'hard';
  reminderTime?: string;
  customDays?: number[];
  createdAt: string;
  completions: string[]; // ISO date strings
}

export interface UserProfile {
  name: string;
  coachGender: 'male' | 'female' | null;
  xp: number;
  level: number;
}

/** Single source of truth for habit-completion rewards. */
export const XP_BY_DIFFICULTY: Record<string, number> = { easy: 5, medium: 10, hard: 20 };
export const COINS_BY_DIFFICULTY: Record<string, number> = { easy: 3, medium: 5, hard: 10 };

export function getXpForDifficulty(difficulty: string): number {
  return XP_BY_DIFFICULTY[difficulty] ?? 10;
}
export function getCoinsForDifficulty(difficulty: string): number {
  return COINS_BY_DIFFICULTY[difficulty] ?? 5;
}

const HABITS_KEY = 'habithero_habits';
const PROFILE_KEY = 'habithero_profile';

export function getHabits(): Habit[] {
  const raw = localStorage.getItem(HABITS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveHabits(habits: Habit[]) {
  localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

export function getProfile(): UserProfile {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? JSON.parse(raw) : { name: 'Hero', coachGender: null, xp: 0, level: 1 };
}

export function saveProfile(profile: UserProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function formatLocalDate(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(str: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new RangeError('Invalid date');
  const [year, month, day] = str.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new RangeError('Invalid date');
  }
  return date;
}

export function isLocalDate(str: string): boolean {
  try {
    parseLocalDate(str);
    return true;
  } catch {
    return false;
  }
}

export function todayStr(): string {
  return formatLocalDate(new Date());
}

export function getStreak(habit: Habit): number {
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatLocalDate(d);
    if (habit.completions.includes(ds)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

// Level/XP progression lives in one place now (src/lib/progression.ts) so the
// 50-level + star system, the server curve and every existing consumer agree.
export {
  MAX_LEVEL,
  STAGES,
  STAR_LEVELS,
  xpToNextLevel,
  xpForLevel,
  getLevelFromXP,
  getStage,
  getStars,
  getNextStar,
  getNextReward,
  getRewardForLevel,
  isMilestoneLevel,
  LEVEL_REWARDS,
} from './progression';

export function getStreakMessage(streak: number): { message: string; urgent: boolean } {
  if (streak === 0) return { message: "Start a streak today — future you will thank you 🚀", urgent: false };
  if (streak >= 100) return { message: `${streak}-day streak! You're a legend 💎`, urgent: false };
  if (streak >= 50) return { message: `${streak} days! You're becoming unstoppable 🏆`, urgent: false };
  if (streak >= 21) return { message: `${streak}-day streak! This is who you are now 🔥`, urgent: false };
  if (streak >= 7) return { message: `${streak}-day streak — don't break the chain! ⚡`, urgent: true };
  return { message: `${streak}-day streak — keep building momentum 💪`, urgent: true };
}

export function getComebackMessage(lastActiveDate: string | null): string | null {
  if (!lastActiveDate) return null;
  const last = new Date(lastActiveDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - last.getTime()) / 86400000);
  if (diffDays <= 1) return null;
  if (diffDays <= 3) return "We missed you! Let's pick up where you left off 💪";
  if (diffDays <= 7) return "You were doing so well — let's get back on track 🔥";
  return "Every champion has setbacks. Your comeback starts now 🚀";
}

const QUOTES = [
  "Discipline is choosing between what you want now and what you want most.",
  "Small daily improvements over time lead to stunning results.",
  "Success is the sum of small efforts repeated day in and day out.",
  "You don't have to be extreme, just consistent.",
  "The secret of your future is hidden in your daily routine.",
  "Champions keep playing until they get it right.",
  "Be stronger than your excuses.",
  "It's not about perfect. It's about effort.",
  "Your only limit is you.",
  "Progress, not perfection."
];

export function getDailyQuote(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

const HABIT_COLORS = [
  'hsl(160, 84%, 50%)',
  'hsl(270, 70%, 60%)',
  'hsl(40, 95%, 55%)',
  'hsl(200, 80%, 55%)',
  'hsl(340, 75%, 55%)',
  'hsl(30, 90%, 55%)',
];

export function getHabitColor(index: number): string {
  return HABIT_COLORS[index % HABIT_COLORS.length];
}

const EMOJIS = ['💪', '📚', '🧘', '🏃', '💧', '🎯', '✍️', '🌅', '💤', '🥗'];

export function getRandomEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}
