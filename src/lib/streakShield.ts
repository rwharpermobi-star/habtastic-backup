import { differenceInCalendarDays } from 'date-fns';

// Streak Shield rules — single source of truth so UI + hook stay in sync.
export const STREAK_SHIELD_RULES = {
  /** Max number of shields a user can hold at once */
  MAX_HELD: 3,
  /** Cooldown between activations (in days) */
  COOLDOWN_DAYS: 1,
  /** Max activations per rolling 7-day window */
  MAX_PER_WEEK: 2,
  /** XP cost to buy one with XP */
  XP_COST: 50,
  /** Free monthly grant for premium users */
  PREMIUM_MONTHLY_GRANT: 3,
};

/** Compute remaining cooldown (days) based on freeze_used_dates */
export function getShieldCooldownDays(usedDates: string[]): number {
  if (!usedDates.length) return 0;
  const sorted = [...usedDates].sort();
  const last = sorted[sorted.length - 1];
  const diffDays = differenceInCalendarDays(new Date(), new Date(last + 'T00:00:00'));
  return Math.max(0, STREAK_SHIELD_RULES.COOLDOWN_DAYS - diffDays);
}

/** Activations in the last 7 days */
export function getShieldsUsedThisWeek(usedDates: string[]): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  return usedDates.filter(d => new Date(d + 'T00:00:00') >= cutoff).length;
}
