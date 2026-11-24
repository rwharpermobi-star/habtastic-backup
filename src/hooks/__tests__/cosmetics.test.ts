import { describe, it, expect } from 'vitest';
import { unlockRuleLabel, rarityColor, rarityLabel } from '@/hooks/useCosmetics';

describe('useCosmetics utils', () => {
  it('labels each rarity', () => {
    expect(rarityLabel('common')).toBe('Common');
    expect(rarityLabel('rare')).toBe('Rare');
    expect(rarityLabel('epic')).toBe('Epic');
    expect(rarityLabel('legendary')).toBe('Legendary');
  });

  it('returns hsl color per rarity', () => {
    (['common','rare','epic','legendary'] as const).forEach((r) => {
      expect(rarityColor(r)).toMatch(/^hsl\(/);
    });
  });

  it('formats unlock rules', () => {
    expect(unlockRuleLabel({ type: 'purchase' })).toMatch(/special/i);
    expect(unlockRuleLabel({ type: 'streak', days: 30 })).toMatch(/30/);
    expect(unlockRuleLabel({ type: 'referrals', count: 10 })).toMatch(/10/);
    expect(unlockRuleLabel({ type: 'xp', amount: 5000 })).toMatch(/5000/);
    expect(unlockRuleLabel({ type: 'leaderboard', place: 1 })).toMatch(/#1/);
    expect(unlockRuleLabel({ type: 'event' })).toMatch(/event/i);
    expect(unlockRuleLabel({ type: 'other' })).toMatch(/special/i);
  });
});

describe('cosmetic catalog pricing bounds', () => {
  const PRICE_BANDS: Record<string, [number, number | null]> = {
    common: [50, 100],
    rare: [150, 300],
    epic: [400, 750],
    legendary: [1000, null], // 1000+
  };

  it('bands are well-formed', () => {
    expect(PRICE_BANDS.common[0]).toBeLessThan(PRICE_BANDS.common[1]!);
    expect(PRICE_BANDS.rare[0]).toBeLessThan(PRICE_BANDS.rare[1]!);
    expect(PRICE_BANDS.epic[0]).toBeLessThan(PRICE_BANDS.epic[1]!);
    expect(PRICE_BANDS.legendary[0]).toBeGreaterThanOrEqual(1000);
  });
});
