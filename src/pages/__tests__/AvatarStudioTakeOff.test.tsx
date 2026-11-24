import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ equip: vi.fn(), unequip: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { avatar_url: null, name: 'Sam' } }) }));
vi.mock('@/hooks/useCosmetics', async (orig) => {
  const real = await orig<typeof import('@/hooks/useCosmetics')>();
  const rows = [
    { id: 'frame_star_gold', category: 'frame', name: 'Gold Star Frame', rarity: 'epic', unlock_rule: { type: 'level', level: 30 } },
    { id: 'frame_star_silver', category: 'frame', name: 'Silver Star Frame', rarity: 'rare', unlock_rule: { type: 'level', level: 20 } },
    { id: 'crown_master', category: 'crown', name: 'Master Crown', rarity: 'legendary', unlock_rule: { type: 'level', level: 50 } },
    { id: 'effect_driven_flame', category: 'effect', name: 'Driven Flame', rarity: 'epic', unlock_rule: { type: 'level', level: 45 } },
  ];
  const catalog = rows.map(real.toCosmeticItem).filter(Boolean);
  return {
    ...real,
    useCosmetics: () => ({
      catalog,
      owned: rows.map((r) => ({ item_id: r.id })),
      ownedIds: new Set(rows.map((r) => r.id)),
      equipped: real.toEquippedSlots({ frame: 'frame_star_gold', crown: 'crown_master', effect: 'effect_driven_flame' }),
      equip: mocks.equip,
      unequip: mocks.unequip,
      unlockEligible: vi.fn(async () => []),
    }),
  };
});

import AvatarStudio from '../AvatarStudio';

const openTab = (label: string) => {
  render(<MemoryRouter><AvatarStudio /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: label }));
};

describe('Avatar Studio take off', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it.each([
    ['Frames', 'Take off Gold Star Frame', 'frame'],
    ['Hats', 'Take off Master Crown', 'hat'],
    ['Effects', 'Take off Driven Flame', 'effect'],
  ])('tapping the worn item in %s takes it off that slot', (tab, label, slot) => {
    openTab(tab);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(mocks.unequip).toHaveBeenCalledWith(slot);
    expect(mocks.equip).not.toHaveBeenCalled();
  });

  it('tapping an item that is not worn puts it on instead', () => {
    openTab('Frames');
    fireEvent.click(screen.getByRole('button', { name: 'Wear Silver Star Frame' }));
    expect(mocks.equip).toHaveBeenCalledWith('frame_star_silver');
    expect(mocks.unequip).not.toHaveBeenCalled();
  });
});
