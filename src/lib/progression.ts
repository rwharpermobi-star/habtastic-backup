/**
 * Single source of truth for HabTastic AI's long-term progression:
 * 50 levels → 5 stages → 5 stars → claim-once level rewards.
 *
 * The XP itself lives on `profiles.xp` and is awarded by the existing
 * `award_xp` RPC — this module only interprets it. The same curve is
 * mirrored server-side in `public.level_from_xp()` so rewards can never be
 * claimed for a level the server does not agree with.
 *
 * Prestige-ready: adding Master I/II/III later means extending STAGES and
 * MAX_LEVEL here, not rewriting callers.
 */

export const MAX_LEVEL = 50;

export interface Stage {
  name: string;
  emoji: string;
  minLevel: number;
  maxLevel: number;
  /** brand-aligned accent used by badges/stars */
  color: string;
}

export const STAGES: Stage[] = [
  { name: 'Beginner',   emoji: '🌱', minLevel: 1,  maxLevel: 10, color: 'hsl(160, 84%, 50%)' },
  { name: 'Builder',    emoji: '🔨', minLevel: 11, maxLevel: 20, color: 'hsl(190, 85%, 55%)' },
  { name: 'Consistent', emoji: '⚡', minLevel: 21, maxLevel: 30, color: 'hsl(210, 95%, 62%)' },
  { name: 'Driven',     emoji: '🔥', minLevel: 31, maxLevel: 40, color: 'hsl(275, 80%, 65%)' },
  { name: 'Master',     emoji: '👑', minLevel: 41, maxLevel: 50, color: 'hsl(45, 95%, 58%)' },
];

/** Levels at which a star is unlocked. */
export const STAR_LEVELS = [10, 20, 30, 40, 50] as const;

/**
 * XP required to go from `level` to `level + 1`.
 *
 * Smooth curve rather than a hardcoded table: early levels land near one
 * active day (~75 XP) and later levels stretch to ~5 days, so a consistent
 * user reaches level 50 in roughly 5-6 months (~14.6k XP total) instead of a
 * few weeks. Mirrored exactly by `public.xp_to_next_level()` in Postgres.
 */
export function xpToNextLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level || 1));
  if (safe >= MAX_LEVEL) return 0;
  return Math.round((75 * Math.pow(safe, 0.45)) / 5) * 5;
}

/** Cumulative XP required to REACH `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const target = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level || 1)));
  let total = 0;
  for (let l = 1; l < target; l++) total += xpToNextLevel(l);
  return total;
}

export function getStage(level: number): Stage {
  const safe = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level || 1)));
  return STAGES.find((s) => safe >= s.minLevel && safe <= s.maxLevel) ?? STAGES[0];
}

/** Stars earned at this level (0–5), unlocking exactly at 10/20/30/40/50. */
export function getStars(level: number): number {
  const safe = Math.max(0, Math.floor(level || 0));
  return STAR_LEVELS.filter((l) => safe >= l).length;
}

/** Next star milestone, or null once all five are earned. */
export function getNextStar(level: number): { star: number; level: number } | null {
  const safe = Math.max(0, Math.floor(level || 0));
  const idx = STAR_LEVELS.findIndex((l) => safe < l);
  if (idx === -1) return null;
  return { star: idx + 1, level: STAR_LEVELS[idx] };
}

/**
 * Level + in-level progress from a raw XP total.
 * Return shape is intentionally identical to the previous implementation so
 * every existing consumer keeps working unchanged.
 */
export function getLevelFromXP(xp: number): {
  level: number;
  progress: number;
  title: string;
  emoji: string;
  xpCurrent: number;
  xpNeeded: number;
} {
  let remaining = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  while (level < MAX_LEVEL) {
    const cost = xpToNextLevel(level);
    if (remaining < cost) break;
    remaining -= cost;
    level++;
  }
  const stage = getStage(level);
  const xpNeeded = xpToNextLevel(level);
  const atMax = level >= MAX_LEVEL;
  return {
    level,
    progress: atMax ? 1 : xpNeeded > 0 ? remaining / xpNeeded : 1,
    title: stage.name,
    emoji: stage.emoji,
    xpCurrent: atMax ? 0 : remaining,
    xpNeeded: atMax ? 0 : xpNeeded,
  };
}

/* ------------------------------- rewards ------------------------------- */

export interface LevelReward {
  level: number;
  /** display label used by the celebration + Progress "next reward" line */
  label: string;
  coins: number;
  cosmeticId: string | null;
  cosmeticName: string | null;
  streakSavers: number;
  badge: string | null;
}

/**
 * Mirrors `public.level_reward_config()`. The server is authoritative for
 * payouts; this table exists only so the UI can preview and label them.
 * No gaps larger than 5 levels — enforced by tests.
 */
export const LEVEL_REWARDS: LevelReward[] = [
  { level: 2,  label: 'Starter Reward',                    coins: 50,   cosmeticId: null,                   cosmeticName: null,                  streakSavers: 0, badge: null },
  { level: 3,  label: 'Beginner Frame',                    coins: 0,    cosmeticId: 'frame_beginner_glow',   cosmeticName: 'Beginner Glow Frame',  streakSavers: 0, badge: null },
  { level: 5,  label: 'Rare Chest',                        coins: 150,  cosmeticId: null,                   cosmeticName: null,                  streakSavers: 0, badge: null },
  { level: 7,  label: 'Streak Saver',                      coins: 0,    cosmeticId: null,                   cosmeticName: null,                  streakSavers: 1, badge: null },
  { level: 9,  label: 'Winston Spark',                     coins: 0,    cosmeticId: 'effect_winston_spark',  cosmeticName: 'Winston Spark',       streakSavers: 0, badge: null },
  { level: 10, label: '1st Star + Bronze Star Frame',      coins: 300,  cosmeticId: 'frame_star_bronze',     cosmeticName: 'Bronze Star Frame',   streakSavers: 0, badge: 'Beginner' },
  { level: 15, label: 'Rare Chest',                        coins: 250,  cosmeticId: null,                   cosmeticName: null,                  streakSavers: 0, badge: null },
  { level: 20, label: '2nd Star + Silver Star Frame',      coins: 500,  cosmeticId: 'frame_star_silver',     cosmeticName: 'Silver Star Frame',   streakSavers: 0, badge: 'Builder' },
  { level: 25, label: 'Builder Aura',                      coins: 200,  cosmeticId: 'effect_builder_aura',   cosmeticName: 'Builder Aura',        streakSavers: 0, badge: null },
  { level: 30, label: '3rd Star + Gold Star Frame',        coins: 750,  cosmeticId: 'frame_star_gold',       cosmeticName: 'Gold Star Frame',     streakSavers: 1, badge: 'Consistent' },
  { level: 35, label: 'Streak Saver',                      coins: 300,  cosmeticId: null,                   cosmeticName: null,                  streakSavers: 1, badge: null },
  { level: 40, label: '4th Star + Platinum Star Frame',    coins: 1000, cosmeticId: 'frame_star_platinum',   cosmeticName: 'Platinum Star Frame', streakSavers: 0, badge: 'Driven' },
  { level: 45, label: 'Driven Flame',                      coins: 400,  cosmeticId: 'effect_driven_flame',   cosmeticName: 'Driven Flame',        streakSavers: 0, badge: null },
  { level: 50, label: '5th Star + Master Crown',           coins: 1500, cosmeticId: 'crown_master',          cosmeticName: 'Master Crown',        streakSavers: 2, badge: 'Master' },
];

export function getRewardForLevel(level: number): LevelReward | null {
  return LEVEL_REWARDS.find((r) => r.level === level) ?? null;
}

/** Next unclaimed-by-level reward ahead of the user, or null past level 50. */
export function getNextReward(level: number): LevelReward | null {
  const safe = Math.max(0, Math.floor(level || 0));
  return LEVEL_REWARDS.find((r) => r.level > safe) ?? null;
}

export function isMilestoneLevel(level: number): boolean {
  return (STAR_LEVELS as readonly number[]).includes(level);
}

/** Human labels for reward payloads returned by `claim_level_rewards()`. */
export function describeReward(r: {
  coins?: number | null;
  cosmetic_id?: string | null;
  streak_savers?: number | null;
  badge?: string | null;
}): string[] {
  const out: string[] = [];
  // Coin economy temporarily disabled — coin rewards are not surfaced.
  if (r.cosmetic_id) {
    const known = LEVEL_REWARDS.find((x) => x.cosmeticId === r.cosmetic_id);
    out.push(known?.cosmeticName ?? 'New Cosmetic');
  }
  if (r.streak_savers && r.streak_savers > 0) {
    out.push(`+${r.streak_savers} Streak Saver${r.streak_savers > 1 ? 's' : ''}`);
  }
  if (r.badge) out.push(`${r.badge} Badge`);
  return out;
}
