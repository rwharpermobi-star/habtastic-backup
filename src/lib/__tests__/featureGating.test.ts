import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  FREE_HABIT_LIMIT,
  Plan,
  TRIAL_DAYS,
  hasAccess,
  partitionByFreeLimit,
} from '@/lib/featureGating';

describe('feature gating', () => {
  it('keeps Google Drive sync available on the Free plan', () => {
    expect(hasAccess(Plan.FREE, FEATURES.CLOUD_SYNC)).toBe(true);
  });

  it('limits Free users to four active habits and keeps other Premium-only features locked', () => {
    expect(hasAccess(Plan.FREE, FEATURES.UNLIMITED_HABITS)).toBe(false);
    expect(hasAccess(Plan.FREE, FEATURES.ADVANCED_ANALYTICS)).toBe(false);
    expect(hasAccess(Plan.FREE, FEATURES.AD_FREE)).toBe(false);
  });

  it('uses the canonical five-day Premium trial', () => {
    expect(TRIAL_DAYS).toBe(5);
  });

  it('keeps only the first four habits active on the Free plan and preserves the rest as locked', () => {
    const habits = Array.from({ length: 7 }, (_, index) => ({ id: `habit-${index + 1}` }));
    const { active, locked } = partitionByFreeLimit(habits, false, FREE_HABIT_LIMIT);

    expect(active.map(h => h.id)).toEqual(['habit-1', 'habit-2', 'habit-3', 'habit-4']);
    expect(locked.map(h => h.id)).toEqual(['habit-5', 'habit-6', 'habit-7']);
    expect([...active, ...locked]).toEqual(habits);
  });

  it('restores all saved habits immediately when Premium becomes active', () => {
    const habits = Array.from({ length: 7 }, (_, index) => ({ id: `habit-${index + 1}` }));
    const { active, locked } = partitionByFreeLimit(habits, true, FREE_HABIT_LIMIT);

    expect(active).toEqual(habits);
    expect(locked).toEqual([]);
  });
});
