import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL,
  STAR_LEVELS,
  xpToNextLevel,
  xpForLevel,
  getLevelFromXP,
  getStars,
  getStage,
  getNextStar,
  getNextReward,
  isMilestoneLevel,
  LEVEL_REWARDS,
} from '@/lib/progression';

describe('progression — XP curve', () => {
  it('is monotonically increasing and never decreases per level', () => {
    let prev = 0;
    for (let l = 1; l < MAX_LEVEL; l++) {
      const need = xpToNextLevel(l);
      expect(need).toBeGreaterThanOrEqual(prev);
      prev = need;
    }
  });

  it('paces early levels fast and later levels slower', () => {
    expect(xpToNextLevel(1)).toBeLessThanOrEqual(150);
    expect(xpToNextLevel(10)).toBeGreaterThan(xpToNextLevel(5));
    expect(xpToNextLevel(40)).toBeGreaterThan(xpToNextLevel(20));
  });

  it('reaches level 50 in a 4-6 month window for a consistent user (~75 XP/day)', () => {
    const days = xpForLevel(MAX_LEVEL) / 75;
    expect(days).toBeGreaterThan(110);
    expect(days).toBeLessThan(220);
  });

  it('derives level, remainder and progress consistently from total XP', () => {
    for (const level of [1, 2, 7, 19, 20, 33, 49, 50]) {
      const at = xpForLevel(level);
      expect(getLevelFromXP(at).level).toBe(level);
      expect(getLevelFromXP(at).xpCurrent).toBe(0);
      if (level < MAX_LEVEL) {
        expect(getLevelFromXP(at + xpToNextLevel(level) - 1).level).toBe(level);
        expect(getLevelFromXP(at + xpToNextLevel(level)).level).toBe(level + 1);
      }
    }
  });

  it('clamps at max level and handles zero/negative XP', () => {
    expect(getLevelFromXP(0).level).toBe(1);
    expect(getLevelFromXP(-500).level).toBe(1);
    const maxed = getLevelFromXP(xpForLevel(MAX_LEVEL) + 999_999);
    expect(maxed.level).toBe(MAX_LEVEL);
    expect(maxed.progress).toBe(1);
  });
});

describe('progression — stars', () => {
  it('unlocks stars at exactly levels 10/20/30/40/50', () => {
    expect(STAR_LEVELS).toEqual([10, 20, 30, 40, 50]);
    expect(getStars(1)).toBe(0);
    expect(getStars(9)).toBe(0);
    expect(getStars(10)).toBe(1);
    expect(getStars(19)).toBe(1);
    expect(getStars(20)).toBe(2);
    expect(getStars(30)).toBe(3);
    expect(getStars(40)).toBe(4);
    expect(getStars(50)).toBe(5);
  });

  it('reports the next star target, and none at 5 stars', () => {
    expect(getNextStar(1)).toEqual({ level: 10, star: 1 });
    expect(getNextStar(23)).toEqual({ level: 30, star: 3 });
    expect(getNextStar(50)).toBeNull();
  });
});

describe('progression — stages and milestones', () => {
  it('maps levels to the five stages', () => {
    expect(getStage(1).name).toBe('Beginner');
    expect(getStage(10).name).toBe('Beginner');
    expect(getStage(11).name).toBe('Builder');
    expect(getStage(21).name).toBe('Consistent');
    expect(getStage(31).name).toBe('Driven');
    expect(getStage(41).name).toBe('Master');
    expect(getStage(50).name).toBe('Master');
  });

  it('treats star levels as milestones', () => {
    for (const l of STAR_LEVELS) expect(isMilestoneLevel(l)).toBe(true);
    expect(isMilestoneLevel(15)).toBe(false);
  });
});

describe('progression — rewards', () => {
  it('defines rewards only for valid levels and never duplicates a level', () => {
    const levels = LEVEL_REWARDS.map((r) => r.level);
    expect(new Set(levels).size).toBe(levels.length);
    levels.forEach((l) => {
      expect(l).toBeGreaterThanOrEqual(2);
      expect(l).toBeLessThanOrEqual(MAX_LEVEL);
    });
  });

  it('rewards every star milestone', () => {
    const levels = new Set(LEVEL_REWARDS.map((r) => r.level));
    STAR_LEVELS.forEach((l) => expect(levels.has(l)).toBe(true));
  });

  it('points to the next upcoming reward', () => {
    expect(getNextReward(1)?.level).toBe(2);
    expect(getNextReward(23)?.level).toBe(25);
    expect(getNextReward(50)).toBeNull();
  });
});
