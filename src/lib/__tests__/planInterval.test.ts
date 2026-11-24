import { describe, expect, it } from 'vitest';
import { intervalSuffixFor, normalizePlanInterval, planLabelFor, shortPlanNameFor } from '../planInterval';

describe('subscription plan interval labels', () => {
  it('treats the server value "annually" as yearly, with /yr', () => {
    expect(normalizePlanInterval('annually')).toBe('yearly');
    expect(planLabelFor('annually')).toBe('Yearly Plan');
    expect(intervalSuffixFor('annually')).toBe('/yr');
    expect(shortPlanNameFor('annually')).toBe('Yearly');
  });

  it('treats other yearly spellings as yearly', () => {
    for (const v of ['yearly', 'Yearly', 'annual', 'year', 'P1Y']) {
      expect(planLabelFor(v)).toBe('Yearly Plan');
      expect(intervalSuffixFor(v)).toBe('/yr');
    }
  });

  it('keeps monthly as monthly, with /mo', () => {
    expect(planLabelFor('monthly')).toBe('Monthly Plan');
    expect(intervalSuffixFor('monthly')).toBe('/mo');
  });

  it('falls back to Premium Plan with no suffix when unknown', () => {
    expect(planLabelFor(null)).toBe('Premium Plan');
    expect(intervalSuffixFor(undefined)).toBe('');
  });
});
