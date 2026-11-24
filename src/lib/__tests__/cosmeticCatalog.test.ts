import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { toCosmeticItem, toEquippedSlots, unlockRuleLabel, unequipRefusal } from '@/hooks/useCosmetics';
import { COSMETIC_ART } from '@/lib/cosmeticArt';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'frame_star_gold', category: 'frame', name: 'Gold Star Frame', rarity: 'epic',
  price_coins: null, unlock_rule: { type: 'level', level: 30 }, is_active: true, ...overrides,
});

describe('Avatar Studio catalog', () => {
  it('every stored item has bundled artwork', () => {
    const ids = ['crown_master', 'effect_builder_aura', 'effect_driven_flame', 'effect_winston_spark',
      'frame_beginner_glow', 'frame_star_bronze', 'frame_star_gold', 'frame_star_platinum', 'frame_star_silver'];
    for (const id of ids) expect(COSMETIC_ART[id]?.src, id).toBeTruthy();
  });

  it('shows the crown in the Hats tab and keeps its level unlock', () => {
    const item = toCosmeticItem(row({ id: 'crown_master', category: 'crown', unlock_rule: { type: 'level', level: 50 } }));
    expect(item?.category).toBe('hat');
    expect(item?.sort_order).toBe(50);
    expect(unlockRuleLabel(item!.unlock_rule)).toBe('Reach level 50');
  });

  it('keeps items free when no coin price is stored', () => {
    expect(toCosmeticItem(row())?.coin_cost).toBeNull();
    expect(toCosmeticItem(row({ price_coins: 120 }))?.coin_cost).toBe(120);
  });

  it('skips item types the Studio has no tab for', () => {
    expect(toCosmeticItem(row({ category: 'theme' }))).toBeNull();
  });

  it('reads saved choices from the stored frame, crown and effect', () => {
    const slots = toEquippedSlots({ frame: 'frame_star_gold', crown: 'crown_master', effect: 'effect_driven_flame' });
    expect(slots.frame).toBe('frame_star_gold');
    expect(slots.hat).toBe('crown_master');
    expect(slots.effect).toBe('effect_driven_flame');
  });
});

describe('Avatar Studio take-off result', () => {
  it('accepts a confirmed removal', () => {
    expect(unequipRefusal({ ok: true })).toBeNull();
  });
  it('treats a signed-out refusal as an error, not success', () => {
    expect(unequipRefusal({ ok: false, error: 'not_authenticated' })).toBe('Please sign in again to change your avatar.');
  });
  it('treats an invalid-slot refusal or empty reply as an error', () => {
    expect(unequipRefusal({ ok: false, error: 'invalid_slot' })).toBe('Could not remove that item. Please try again.');
    expect(unequipRefusal(null)).toBe('Could not remove that item. Please try again.');
  });
});
