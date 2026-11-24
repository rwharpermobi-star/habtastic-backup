import { describe, it, expect } from 'vitest';
import { DEFAULT_MILESTONES, milestoneFromRow } from '../useReferral';

describe('paid-referral Premium milestones', () => {
  it('defaults to 1 = 7 days, 3 = 30 days, 10 = 90 days, 20 = lifetime', () => {
    expect(DEFAULT_MILESTONES.map(m => [m.count, m.bonusDays, m.lifetime])).toEqual([
      [1, 7, false],
      [3, 30, false],
      [10, 90, false],
      [20, 0, true],
    ]);
  });

  it('labels server rows, including lifetime', () => {
    expect(milestoneFromRow({ milestone_count: 1, premium_days: 7, lifetime: false }).label).toBe('7 Days Premium');
    expect(milestoneFromRow({ milestone_count: 1, premium_days: 7 }).rewards[1]).toBe('Unlocked at 1 qualified paid referral');
    expect(milestoneFromRow({ milestone_count: 10, premium_days: 90 }).rewards[1]).toBe('Unlocked at 10 qualified paid referrals');
    const life = milestoneFromRow({ milestone_count: 20, premium_days: 0, lifetime: true });
    expect(life.label).toBe('Lifetime Premium');
    expect(life.lifetime).toBe(true);
    expect(life.badge).toBe('Legendary Referrer');
  });
});
