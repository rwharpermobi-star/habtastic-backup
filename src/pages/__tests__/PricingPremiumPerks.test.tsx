import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ent = vi.hoisted(() => ({
  user: { id: 'owner' } as { id: string } | null,
  isPremium: false,
  isPaidPremium: false,
  entitlementLoading: false,
  navigate: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: ent.user, loading: false, checkSubscription: vi.fn() }),
}));
vi.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    isPremium: ent.isPremium,
    isPaidPremium: ent.isPaidPremium,
    entitlementLoading: ent.entitlementLoading,
    nextBillingDate: null,
  }),
}));
vi.mock('@/hooks/useReferral', () => ({ useReferral: () => ({ paidReferralCount: 0, MILESTONES: [] }) }));
vi.mock('@/hooks/useExchangeRate', () => ({ useUsdToZarRate: () => ({ rate: 18 }) }));
vi.mock('@/hooks/usePaystackCheckout', () => ({ usePaystackCheckout: () => ({ startCheckout: vi.fn() }) }));
vi.mock('@/hooks/usePricingPlans', () => ({
  usePricingPlans: () => ({
    plans: { monthly: { amount: 99, currency: 'ZAR' }, yearly: { amount: 899, currency: 'ZAR' } },
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/useGooglePlayBilling', () => ({
  useGooglePlayBilling: () => ({
    isPlay: false, supported: false, prices: {}, purchasing: false, restoring: false,
    purchase: vi.fn(), restore: vi.fn(), manage: vi.fn(),
  }),
}));
vi.mock('@/components/PaymentDunningBanner', () => ({ PaymentDunningBanner: () => null }));
vi.mock('@/components/InviteEarnCard', () => ({ default: () => null }));
vi.mock('@/components/PublicFooter', () => ({ default: () => null }));
vi.mock('@/components/UpgradeConfirmModal', () => ({ default: () => null }));
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'eq', 'order', 'limit']) chain[k] = () => chain;
  chain.maybeSingle = async () => ({ data: null });
  chain.single = async () => ({ data: null });
  return { supabase: { from: () => chain, auth: { getUser: async () => ({ data: { user: null } }) } } };
});
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => ent.navigate };
});

import Pricing from '@/pages/Pricing';

const PERKS = [
  'avatar-drops', 'exclusive-themes', 'premium-badges',
  'ai-weekly-reports', 'leaderboard-rewards', 'bonus-chest-loot',
];

function renderPricing() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><Pricing /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  ent.user = { id: 'owner' };
  ent.isPremium = false;
  ent.isPaidPremium = false;
  ent.entitlementLoading = false;
  ent.navigate.mockReset();
});
afterEach(cleanup);

const card = (id: string) => screen.getByTestId(`premium-preview-${id}`);

describe('Premium page perk cards', () => {
  it('paying Premium member sees all six perks as Included with Premium, no padlock', () => {
    ent.isPremium = true;
    ent.isPaidPremium = true;
    renderPricing();
    for (const id of PERKS) {
      expect(card(id).getAttribute('data-state')).toBe('unlocked');
      expect(within(card(id)).getByTestId('preview-status').textContent).toContain('Included with Premium');
    }
    expect(screen.getByText('Your Premium perks')).toBeTruthy();
    fireEvent.click(card('exclusive-themes'));
    expect(ent.navigate).toHaveBeenCalledWith('/settings/appearance');
    ent.navigate.mockReset();
    for (const id of PERKS.filter(i => i !== 'exclusive-themes')) {
      expect(card(id).tagName).not.toBe('BUTTON');
      fireEvent.click(card(id));
    }
    expect(ent.navigate).not.toHaveBeenCalled();
    expect(screen.queryByText('Choose your plan')).toBeNull();
  });

  it('trial (Premium but not paying) still sees the locked teaser', () => {
    ent.isPremium = true;
    ent.isPaidPremium = false;
    renderPricing();
    for (const id of PERKS) {
      expect(card(id).getAttribute('data-state')).toBe('locked');
      expect(within(card(id)).getByTestId('preview-status').textContent).toContain('Premium');
    }
    expect(screen.getByText('A peek inside')).toBeTruthy();
  });

  it('free user sees all six perks locked, not clickable, with plans offered', () => {
    renderPricing();
    for (const id of PERKS) {
      expect(card(id).getAttribute('data-state')).toBe('locked');
      expect(card(id).tagName).not.toBe('BUTTON');
      expect(within(card(id)).getByTestId('preview-status').textContent).toContain('Premium');
    }
    expect(screen.getByText('Choose your plan')).toBeTruthy();
  });

  it('while entitlement loads, shows no lock and no buy options', () => {
    ent.entitlementLoading = true;
    renderPricing();
    for (const id of PERKS) {
      expect(card(id).getAttribute('data-state')).toBe('loading');
      expect(within(card(id)).queryByText('Premium')).toBeNull();
    }
    expect(screen.queryByText('Choose your plan')).toBeNull();
  });

  it('signed-out visitor on the public page sees locked perks', () => {
    ent.user = null;
    ent.isPremium = true;
    ent.isPaidPremium = true; // even a stale hint must not unlock without a session
    renderPricing();
    for (const id of PERKS) expect(card(id).getAttribute('data-state')).toBe('locked');
  });
});
