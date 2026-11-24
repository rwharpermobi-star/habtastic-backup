import { describe, expect, it } from 'vitest';
import {
  calculateSavingsMetrics,
  projectSavings,
  formatMoney,
} from '../../../supabase/functions/_shared/savingsCalculations';

const baseGoal = {
  id: 'goal-1',
  name: 'Holiday',
  target_amount: 10_000,
  starting_amount: 2_000,
  current_amount: 2_000,
  target_date: '2026-05-21',
  created_at: '2026-01-01T00:00:00.000Z',
  currency: 'ZAR',
  regular_saving_amount: 400,
  saving_frequency: 'weekly' as const,
};

describe('Money Saver shared calculation engine', () => {
  it('calculates amount remaining', () => {
    const m = calculateSavingsMetrics(baseGoal, '2026-01-01T00:00:00.000Z');
    expect(m.amountRemaining).toBe(8_000);
  });

  it('calculates daily, weekly and monthly savings needed from the same remaining amount', () => {
    const m = calculateSavingsMetrics(baseGoal, '2026-01-01T00:00:00.000Z');
    expect(m.daysRemaining).toBe(140);
    expect(m.dailyNeeded).toBeCloseTo(57.142857, 4);
    expect(m.weeklyNeeded).toBeCloseTo(400, 4);
    expect(m.monthlyNeeded).toBeGreaterThan(1_700);
    expect(m.monthlyNeeded).toBeLessThan(1_800);
  });

  it('uses the required projection formula', () => {
    expect(projectSavings(3_200, 500, 6)).toBe(6_200);
  });

  it('classifies ahead, on-track, slightly behind and significantly behind consistently', () => {
    const halfway = '2026-03-12T00:00:00.000Z';
    expect(calculateSavingsMetrics({ ...baseGoal, current_amount: 6_500 }, halfway).paceStatus).toBe('ahead');
    expect(calculateSavingsMetrics({ ...baseGoal, current_amount: 6_000 }, halfway).paceStatus).toBe('on_track');
    expect(calculateSavingsMetrics({ ...baseGoal, current_amount: 5_500 }, halfway).paceStatus).toBe('slightly_behind');
    expect(calculateSavingsMetrics({ ...baseGoal, current_amount: 4_000 }, halfway).paceStatus).toBe('significantly_behind');
  });

  it('recalculates the required weekly amount when progress changes', () => {
    const before = calculateSavingsMetrics({ ...baseGoal, current_amount: 2_000 }, '2026-01-01T00:00:00.000Z');
    const after = calculateSavingsMetrics({ ...baseGoal, current_amount: 2_300 }, '2026-01-01T00:00:00.000Z');
    expect(after.weeklyNeeded).toBeLessThan(before.weeklyNeeded);
  });

  it('uses the stored currency instead of assuming USD', () => {
    expect(formatMoney(500, 'ZAR')).toBe('R500');
    expect(formatMoney(500, 'GBP')).toBe('£500');
    expect(formatMoney(500, 'USD')).toBe('$500');
  });
});
