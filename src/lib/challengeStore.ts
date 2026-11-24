export interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  duration: 7 | 30;
  habitName: string;
  startDate: string;
  completedDays: string[];
  reward: { xp: number; badge: string };
}

const CHALLENGES_KEY = 'habithero_challenges';

export function getChallenges(): Challenge[] {
  const raw = localStorage.getItem(CHALLENGES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveChallenges(challenges: Challenge[]) {
  localStorage.setItem(CHALLENGES_KEY, JSON.stringify(challenges));
}

export function getChallengeProgress(challenge: Challenge): number {
  return Math.min(100, (challenge.completedDays.length / challenge.duration) * 100);
}

export function isChallengeComplete(challenge: Challenge): boolean {
  return challenge.completedDays.length >= challenge.duration;
}

export function isChallengeActive(challenge: Challenge): boolean {
  const start = new Date(challenge.startDate);
  const now = new Date();
  const daysPassed = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return daysPassed < challenge.duration && !isChallengeComplete(challenge);
}

export const CHALLENGE_TEMPLATES = [
  {
    title: '7-Day Hydration Sprint',
    description: 'Drink 8 glasses of water every day for 7 days straight.',
    emoji: '💧',
    duration: 7 as const,
    habitName: 'Drink Water',
    reward: { xp: 100, badge: '💧' },
  },
  {
    title: '7-Day Morning Routine',
    description: 'Wake up early and complete your morning routine for 7 days.',
    emoji: '🌅',
    duration: 7 as const,
    habitName: 'Morning Routine',
    reward: { xp: 100, badge: '🌅' },
  },
  {
    title: '7-Day Meditation Streak',
    description: 'Meditate for at least 10 minutes daily for a full week.',
    emoji: '🧘',
    duration: 7 as const,
    habitName: 'Meditate',
    reward: { xp: 100, badge: '🧘' },
  },
  {
    title: '30-Day Fitness Challenge',
    description: 'Exercise every single day for 30 days. No excuses.',
    emoji: '💪',
    duration: 30 as const,
    habitName: 'Exercise',
    reward: { xp: 500, badge: '🏆' },
  },
  {
    title: '30-Day Reading Challenge',
    description: 'Read for at least 20 minutes every day for a month.',
    emoji: '📚',
    duration: 30 as const,
    habitName: 'Read',
    reward: { xp: 500, badge: '📖' },
  },
  {
    title: '30-Day No Phone Before Bed',
    description: 'Put your phone away 1 hour before sleep for 30 days.',
    emoji: '📵',
    duration: 30 as const,
    habitName: 'No Phone Before Bed',
    reward: { xp: 500, badge: '😴' },
  },
];
