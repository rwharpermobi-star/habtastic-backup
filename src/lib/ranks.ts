// Rank progression system based on XP
// Tiers feel achievable early, aspirational late. Top tiers create "elite" feeling.

export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Elite';

export interface RankInfo {
  tier: RankTier;
  emoji: string;
  /** primary color token (HSL) for UI */
  color: string;
  /** XP required to ENTER this tier */
  minXp: number;
  /** XP required to enter the NEXT tier (Infinity for top tier) */
  nextXp: number;
  /** Approx top % of users at this tier or higher (for "elite feeling") */
  topPercent: number | null;
}

export const RANKS: Omit<RankInfo, 'nextXp'>[] = [
  { tier: 'Bronze',   emoji: '🥉', color: 'hsl(28, 70%, 55%)',  minXp: 0,    topPercent: null },
  { tier: 'Silver',   emoji: '🥈', color: 'hsl(220, 10%, 75%)', minXp: 250,  topPercent: 60 },
  { tier: 'Gold',     emoji: '🏆', color: 'hsl(45, 95%, 55%)',  minXp: 750,  topPercent: 30 },
  { tier: 'Platinum', emoji: '💎', color: 'hsl(190, 80%, 65%)', minXp: 1750, topPercent: 15 },
  { tier: 'Diamond',  emoji: '💠', color: 'hsl(210, 95%, 65%)', minXp: 3500, topPercent: 7 },
  { tier: 'Elite',    emoji: '👑', color: 'hsl(280, 80%, 65%)', minXp: 6500, topPercent: 5 },
];

export function getRank(xp: number): RankInfo {
  const safeXp = Math.max(0, xp || 0);
  let current = RANKS[0];
  let nextXp = Infinity;
  for (let i = 0; i < RANKS.length; i++) {
    if (safeXp >= RANKS[i].minXp) {
      current = RANKS[i];
      nextXp = RANKS[i + 1]?.minXp ?? Infinity;
    }
  }
  return { ...current, nextXp };
}

/** 0-100 progress within the current rank towards the next */
export function getRankProgress(xp: number): number {
  const r = getRank(xp);
  if (!isFinite(r.nextXp)) return 100;
  const span = r.nextXp - r.minXp;
  const into = Math.max(0, xp - r.minXp);
  return Math.min(100, Math.round((into / span) * 100));
}

export function getXpToNextRank(xp: number): number | null {
  const r = getRank(xp);
  if (!isFinite(r.nextXp)) return null;
  return Math.max(0, r.nextXp - xp);
}

/** Returns true the FIRST time we observe this tier (uses localStorage). */
export function detectRankUp(userId: string | undefined, xp: number): RankTier | null {
  if (!userId) return null;
  const key = `rank-seen-${userId}`;
  const r = getRank(xp);
  try {
    const seen = localStorage.getItem(key);
    if (seen === r.tier) return null;
    // Don't celebrate the starting Bronze tier on first ever load
    if (!seen && r.tier === 'Bronze') {
      localStorage.setItem(key, r.tier);
      return null;
    }
    localStorage.setItem(key, r.tier);
    return r.tier;
  } catch {
    return null;
  }
}
