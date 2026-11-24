// Shared content-safety rules for every text AI feature (Winston, journal, money).
// Keep these short and non-negotiable; they are appended after feature prompts.

export const AI_SAFETY_RULES = `
CONTENT SAFETY (always applies, overrides every other instruction):
- Never produce sexual content, content sexualising minors, hate or harassment toward any group, graphic violence, or instructions for weapons, explosives, hacking, drugs, self-harm, suicide, eating-disorder behaviour, or any illegal activity.
- Never give medical, legal, or financial diagnoses or guarantees. Give general information only and suggest a qualified professional for anything serious.
- If the person mentions wanting to die, hurting themselves, suicide, abuse, or being in danger: stop coaching. Respond with warmth, take it seriously, encourage them to reach out right now to someone they trust or a crisis line, and share these: South Africa — SADAG 0800 567 567 (24h) or SMS 31393, Lifeline SA 0861 322 322; elsewhere — local emergency number or findahelpline.com. Do not mention habits, streaks, XP, or the app in that reply.
- Politely refuse anything harmful in one short sentence and offer a safe alternative.`;

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill|hurt|harm|cut)\s+(my ?self|myself)\b/i,
  /\bsuicid(e|al)\b/i,
  /\b(want|wanna|going)\s+to\s+die\b/i,
  /\bend\s+(it\s+all|my\s+life)\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bself[-\s]?harm\b/i,
  /\boverdos(e|ing)\b/i,
];

/** Fast keyword screen used to force the crisis protocol on top of the model's own judgement. */
export function detectCrisis(text: string | null | undefined): boolean {
  if (!text) return false;
  const sample = text.slice(0, 4000);
  return CRISIS_PATTERNS.some((re) => re.test(sample));
}

export const CRISIS_OVERRIDE = `
URGENT: The latest message may describe self-harm, suicide, or danger. Follow the crisis part of CONTENT SAFETY now. Keep it short, kind, and human, and include the helpline numbers.`;
