import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShieldCooldownDays } from '@/lib/streakShield';

describe('Streak Shield cooldown', () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it('expires after a calendar day across spring-forward DST', () => {
    expect(new Date('2026-03-09T00:00:00').getTime() - new Date('2026-03-08T00:00:00').getTime())
      .toBe(23 * 60 * 60 * 1000);
    expect(getShieldCooldownDays(['2026-03-08'])).toBe(0);
  });

  it('keeps the cooldown on the day of the latest use', () => {
    expect(getShieldCooldownDays(['2026-03-09', '2026-03-07'])).toBe(1);
  });

  it('has no cooldown without previous uses', () => {
    expect(getShieldCooldownDays([])).toBe(0);
  });
});
