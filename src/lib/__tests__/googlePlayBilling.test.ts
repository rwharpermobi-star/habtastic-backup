import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const platform = { native: false, name: 'web' };

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
}));

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: any[]) => invoke(...args) } },
}));

const purchaseProduct = vi.fn();
vi.mock('@capgo/native-purchases', () => ({
  NativePurchases: {
    isBillingSupported: async () => ({ isBillingSupported: true }),
    getProducts: async () => ({
      products: [
        { identifier: 'monthly', planIdentifier: 'habtastic_premium_monthly', price: 49, priceString: 'R49.00', currencyCode: 'ZAR' },
        { identifier: 'yearly', planIdentifier: 'habtastic_premium_yearly', price: 399, priceString: 'R399.00', currencyCode: 'ZAR' },
      ],
    }),
    purchaseProduct: (...args: any[]) => purchaseProduct(...args),
    manageSubscriptions: async () => undefined,
  },
  PURCHASE_TYPE: { SUBS: 'subs', INAPP: 'inapp' },
}));

const setPlatform = (name: string, native: boolean) => {
  platform.name = name;
  platform.native = native;
};

describe('google play billing platform routing', () => {
  beforeEach(() => {
    invoke.mockReset();
    purchaseProduct.mockReset();
  });
  afterEach(() => setPlatform('web', false));

  it('uses Paystack on web and never Play billing', async () => {
    setPlatform('web', false);
    const m = await import('@/lib/googlePlayBilling');
    expect(m.shouldUsePlayBilling()).toBe(false);
    expect(m.shouldUsePaystack()).toBe(true);
    await expect(m.purchasePlayPlan('monthly', 'user-1')).rejects.toThrow(/only available on Android/i);
    expect(purchaseProduct).not.toHaveBeenCalled();
  });

  it('uses Play billing on native Android and never Paystack', async () => {
    setPlatform('android', true);
    const m = await import('@/lib/googlePlayBilling');
    expect(m.shouldUsePlayBilling()).toBe(true);
    expect(m.shouldUsePaystack()).toBe(false);
  });

  it('purchases the right product/base plan and verifies server-side', async () => {
    setPlatform('android', true);
    const m = await import('@/lib/googlePlayBilling');
    purchaseProduct.mockResolvedValue({ purchaseToken: 'tok-123', productIdentifier: 'habtastic_premium_yearly' });
    invoke.mockResolvedValue({ data: { verified: true, entitled: true, current_period_end: '2027-01-01T00:00:00Z' }, error: null });

    const res = await m.purchasePlayPlan('yearly', 'user-9');

    expect(purchaseProduct).toHaveBeenCalledWith(expect.objectContaining({
      productIdentifier: 'habtastic_premium_yearly',
      planIdentifier: 'yearly',
      productType: 'subs',
      appAccountToken: 'user-9',
    }));
    expect(invoke).toHaveBeenCalledWith('google-play-verify', {
      body: { purchaseToken: 'tok-123', productId: 'habtastic_premium_yearly', basePlanId: 'yearly' },
    });
    expect(res.verified).toBe(true);
    expect(res.entitled).toBe(true);
  });

  it('never grants premium when verification fails', async () => {
    setPlatform('android', true);
    const m = await import('@/lib/googlePlayBilling');
    purchaseProduct.mockResolvedValue({ purchaseToken: 'tok-bad' });
    invoke.mockResolvedValue({ data: { verified: false, entitled: false, error: 'purchase_not_found' }, error: null });
    await expect(m.purchasePlayPlan('monthly', 'user-9')).rejects.toThrow(/purchase_not_found/);
  });

  it('loads localized Play prices for both plans', async () => {
    setPlatform('android', true);
    const m = await import('@/lib/googlePlayBilling');
    const prices = await m.loadPlayPrices();
    expect(prices.monthly?.priceString).toBe('R49.00');
    expect(prices.yearly?.currencyCode).toBe('ZAR');
  });

  it('exposes the exact Play Console ids', async () => {
    const m = await import('@/lib/googlePlayBilling');
    expect(m.PLAY_PRODUCTS).toEqual({
      monthly: { productId: 'habtastic_premium_monthly', basePlanId: 'monthly' },
      yearly: { productId: 'habtastic_premium_yearly', basePlanId: 'yearly' },
    });
  });
});
