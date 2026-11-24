import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  loading: false,
  catalogError: false,
  reloadCatalog: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: { avatar_url: null, name: 'Sam' } }) }));
vi.mock('@/hooks/useCosmetics', async (orig) => {
  const real = await orig<typeof import('@/hooks/useCosmetics')>();
  return {
    ...real,
    useCosmetics: () => ({
      catalog: state.rows.map(real.toCosmeticItem).filter(Boolean),
      owned: [],
      ownedIds: new Set<string>(),
      equipped: real.toEquippedSlots(null),
      equip: vi.fn(),
      unequip: vi.fn(),
      unlockEligible: vi.fn(async () => []),
      loading: state.loading,
      catalogError: state.catalogError,
      reloadCatalog: state.reloadCatalog,
    }),
  };
});

import AvatarStudio from '../AvatarStudio';

const LIVE_ROWS = [
  { id: 'frame_beginner_glow', category: 'frame', name: 'Beginner Glow Frame', rarity: 'common', unlock_rule: { type: 'level', level: 3 } },
  { id: 'effect_winston_spark', category: 'effect', name: 'Winston Spark', rarity: 'rare', unlock_rule: { type: 'level', level: 9 } },
  { id: 'crown_master', category: 'crown', name: 'Master Crown', rarity: 'legendary', unlock_rule: { type: 'level', level: 50 } },
];

const renderStudio = () => render(<MemoryRouter><AvatarStudio /></MemoryRouter>);

describe('Avatar Studio never opens onto a blank area', () => {
  beforeEach(() => {
    cleanup();
    state.rows = [];
    state.loading = false;
    state.catalogError = false;
    state.reloadCatalog.mockReset();
  });

  it('only offers categories that have items and opens the first one', () => {
    state.rows = LIVE_ROWS;
    renderStudio();
    expect(screen.queryByRole('button', { name: 'Hairstyles' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Faces' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accessories' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hats' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Frames' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Effects' })).toBeTruthy();
    // Hats is first, so the crown shows straight away.
    expect(screen.getAllByText('Master Crown').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Frames' }));
    expect(screen.getAllByText('Beginner Glow Frame').length).toBeGreaterThan(0);
  });

  it('shows an error with a retry button when the items fail to load', () => {
    state.catalogError = true;
    renderStudio();
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your avatar items");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.reloadCatalog).toHaveBeenCalled();
  });

  it('says there are no items yet when the list is empty', () => {
    renderStudio();
    expect(screen.getByText('No items yet')).toBeTruthy();
  });

  it('shows a loading message while the list loads', () => {
    state.loading = true;
    renderStudio();
    expect(screen.getByText('Loading items…')).toBeTruthy();
  });
});
