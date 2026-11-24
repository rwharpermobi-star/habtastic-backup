// Winston verification & reflection prompt library.
// Pure data — no side effects, safe to import anywhere.

export const DEFAULT_VERIFICATION_QUESTIONS: Record<string, string> = {
  health: 'What did you do for your health today?',
  fitness: 'What workout did you complete today?',
  mindset: 'How are you feeling mentally after that?',
  mindfulness: 'How did your session feel today?',
  work: 'What did you focus on during this session?',
  productivity: 'What did you get done?',
  art: 'What did you create or practice today?',
  finance: 'What money habit did you act on today?',
  learning: 'What did you learn or read today?',
  social: 'Who did you connect with?',
  custom: 'How did it go today?',
};

export function questionForHabit(category: string | null | undefined, override?: string | null): string {
  const o = (override ?? '').trim();
  if (o) return o;
  const key = (category ?? 'custom').toLowerCase();
  return DEFAULT_VERIFICATION_QUESTIONS[key] ?? DEFAULT_VERIFICATION_QUESTIONS.custom;
}

export const REFLECTION_PROMPTS: string[] = [
  'What went well today?',
  'What challenged you today?',
  'What are you proud of today?',
  'What can you improve tomorrow?',
  'What did you learn about yourself today?',
];

export function pickDailyReflectionPrompt(seed?: string): string {
  const day = seed ?? new Date().toISOString().split('T')[0];
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) >>> 0;
  return REFLECTION_PROMPTS[h % REFLECTION_PROMPTS.length];
}
