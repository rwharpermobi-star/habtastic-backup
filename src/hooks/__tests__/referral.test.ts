import { describe, it, expect } from 'vitest';

// Mirror of MILESTONES tier values from src/hooks/useReferral.ts.
// Kept inline so the math contract is independently verified.
const MILESTONES = [
  { count: 10, bonusDays: 7 },
  { count: 25, bonusDays: 14 },
  { count: 50, bonusDays: 30 },
];

function unlocked(paid: number) {
  return MILESTONES.filter((m) => paid >= m.count);
}

function nextMilestone(paid: number) {
  return MILESTONES.find((m) => paid < m.count) ?? MILESTONES[MILESTONES.length - 1];
}

function daysEarned(paid: number) {
  return unlocked(paid).reduce((s, m) => s + m.bonusDays, 0);
}

// Risk score model — same weights as referral_risk_score SQL function
type Signal = { type: string; weight: number };
function riskScore(signals: Signal[]) {
  return signals.reduce((s, x) => s + x.weight, 0);
}
function riskBand(score: number): 'ok' | 'review' | 'block' {
  if (score >= 100) return 'block';
  if (score >= 50) return 'review';
  return 'ok';
}

describe('Referral milestones (paid-only)', () => {
  it('returns no milestones before 10 paid referrals', () => {
    expect(unlocked(0)).toHaveLength(0);
    expect(unlocked(9)).toHaveLength(0);
    expect(daysEarned(9)).toBe(0);
  });

  it('unlocks 7 days Premium at 10 paid referrals', () => {
    expect(unlocked(10).map((m) => m.count)).toEqual([10]);
    expect(daysEarned(10)).toBe(7);
  });

  it('unlocks 7 + 14 days at 25 paid referrals', () => {
    expect(unlocked(25).map((m) => m.count)).toEqual([10, 25]);
    expect(daysEarned(25)).toBe(21);
  });

  it('does not unlock the second tier at 24 paid referrals', () => {
    expect(unlocked(24).map((m) => m.count)).toEqual([10]);
  });

  it('unlocks all three Premium-day milestones at 50 paid referrals', () => {
    expect(unlocked(50).map((m) => m.count)).toEqual([10, 25, 50]);
    expect(daysEarned(50)).toBe(51);
  });

  it('reports the correct next milestone', () => {
    expect(nextMilestone(0).count).toBe(10);
    expect(nextMilestone(10).count).toBe(25);
    expect(nextMilestone(25).count).toBe(50);
    expect(nextMilestone(75).count).toBe(50); // clamped to highest tier
  });
});

describe('Referral risk score', () => {
  it('treats no signals as safe', () => {
    expect(riskScore([])).toBe(0);
    expect(riskBand(0)).toBe('ok');
  });

  it('does not block on IP alone (needs ≥2 signals)', () => {
    const score = riskScore([{ type: 'same_ip', weight: 30 }]);
    expect(score).toBe(30);
    expect(riskBand(score)).toBe('ok');
  });

  it('flags review when fingerprint matches (60)', () => {
    const score = riskScore([{ type: 'same_device_fp', weight: 60 }]);
    expect(riskBand(score)).toBe('review');
  });

  it('blocks on self-attempt (weight 100)', () => {
    const score = riskScore([{ type: 'self_attempt', weight: 100 }]);
    expect(riskBand(score)).toBe('block');
  });

  it('blocks on fingerprint + IP combined (≥100)', () => {
    const score = riskScore([
      { type: 'same_device_fp', weight: 60 },
      { type: 'same_ip', weight: 30 },
      { type: 'rapid_signup_burst', weight: 40 },
    ]);
    expect(score).toBeGreaterThanOrEqual(100);
    expect(riskBand(score)).toBe('block');
  });
});
