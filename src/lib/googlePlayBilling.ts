// Google Play Billing (native Android only).
//
// Play policy requires that digital subscriptions sold inside the Android app
// go through Google Play Billing — Paystack (or any external checkout) must
// never be opened from the Play build. Web keeps using Paystack unchanged.
//
// The plugin is imported dynamically so the web bundle never pulls native code.
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

export type PlayPlan = 'monthly' | 'yearly';

/** Exact Play Console IDs. Keep in sync with docs/GooglePlayBilling.md. */
export const PLAY_PRODUCTS: Record<PlayPlan, { productId: string; basePlanId: string }> = {
  monthly: { productId: 'habtastic_premium_monthly', basePlanId: 'monthly' },
  yearly: { productId: 'habtastic_premium_yearly', basePlanId: 'yearly' },
};

/** True only inside the installed Android app (never in a browser). */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/** Native Android must use Google Play Billing for Premium. */
export function shouldUsePlayBilling(): boolean {
  return isNativeAndroid();
}

/** Paystack is allowed on web / non-Play platforms only. */
export function shouldUsePaystack(): boolean {
  return !shouldUsePlayBilling();
}

export interface PlayPrice {
  plan: PlayPlan;
  priceString: string;
  price: number;
  currencyCode: string;
}

export interface PlayVerificationResult {
  verified: boolean;
  entitled: boolean;
  current_period_end: string | null;
  plan_interval?: string;
  status?: string;
}

async function loadPlugin() {
  const mod = await import('@capgo/native-purchases');
  return mod;
}

/** Checks that the device actually supports Play subscription billing. */
export async function isPlayBillingAvailable(): Promise<boolean> {
  if (!shouldUsePlayBilling()) return false;
  try {
    const { NativePurchases } = await loadPlugin();
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    return !!isBillingSupported;
  } catch (e) {
    console.warn('[play-billing] billing unsupported', e);
    return false;
  }
}

/** Loads localized Play Store prices for both subscription base plans. */
export async function loadPlayPrices(): Promise<Partial<Record<PlayPlan, PlayPrice>>> {
  if (!shouldUsePlayBilling()) return {};
  const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: [PLAY_PRODUCTS.monthly.productId, PLAY_PRODUCTS.yearly.productId],
    productType: PURCHASE_TYPE.SUBS,
  });

  const out: Partial<Record<PlayPlan, PlayPrice>> = {};
  for (const plan of ['monthly', 'yearly'] as PlayPlan[]) {
    const { productId, basePlanId } = PLAY_PRODUCTS[plan];
    // On Android `planIdentifier` is the subscription product id and
    // `identifier` is the base plan id.
    const match =
      products.find(p => p.planIdentifier === productId && p.identifier === basePlanId) ??
      products.find(p => p.planIdentifier === productId) ??
      products.find(p => p.identifier === productId);
    if (!match) continue;
    out[plan] = {
      plan,
      priceString: match.priceString,
      price: match.price,
      currencyCode: match.currencyCode,
    };
  }
  return out;
}

/** Verification error carrying the server's reason code (e.g. account_mismatch). */
export class PlayVerificationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Purchase could not be verified (${code})`);
    this.name = 'PlayVerificationError';
    this.code = code;
  }
}

async function readErrorCode(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch { /* not JSON */ }
    if (ctx.status === 429) return 'rate_limited';
    if (ctx.status >= 500) return 'verification_unavailable';
  }
  return 'network_error';
}

/** Server-side purchase verification. Premium is derived server-side from the verified subscription row. */
export async function verifyPlayPurchase(input: {
  purchaseToken: string;
  productId: string;
  basePlanId: string;
}): Promise<PlayVerificationResult> {
  const { data, error } = await supabase.functions.invoke('google-play-verify', {
    body: input,
  });
  if (error) throw new PlayVerificationError(await readErrorCode(error));
  if (!data?.verified || !data?.entitled) {
    const code = data?.status === 'SUBSCRIPTION_STATE_PENDING'
      ? 'payment_pending'
      : (typeof data?.error === 'string' && data.error) || 'not_entitled';
    throw new PlayVerificationError(code);
  }
  return data as PlayVerificationResult;
}

/**
 * Runs the Google Play purchase flow for a plan and verifies it server-side.
 * The Supabase user id is passed as the app account token so Google Play can
 * link the purchase to the account (and so we can filter restores).
 */
export async function purchasePlayPlan(plan: PlayPlan, userId: string): Promise<PlayVerificationResult> {
  if (!shouldUsePlayBilling()) throw new Error('Google Play Billing is only available on Android');
  const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
  const { productId, basePlanId } = PLAY_PRODUCTS[plan];

  const tx = await NativePurchases.purchaseProduct({
    productIdentifier: productId,
    planIdentifier: basePlanId,
    productType: PURCHASE_TYPE.SUBS,
    quantity: 1,
    appAccountToken: userId,
  });

  const purchaseToken = tx.purchaseToken || tx.transactionId;
  if (!purchaseToken) throw new PlayVerificationError('missing_purchase_token');

  return verifyPlayPurchase({ purchaseToken, productId, basePlanId });
}

/**
 * Restores existing Play subscriptions and re-verifies them server-side.
 * Returns the verification result of the first entitlement-valid purchase.
 */
export async function restorePlayPurchases(userId: string): Promise<PlayVerificationResult | null> {
  if (!shouldUsePlayBilling()) return null;
  const { NativePurchases, PURCHASE_TYPE } = await loadPlugin();
  try {
    await NativePurchases.restorePurchases();
  } catch (e) {
    console.warn('[play-billing] restorePurchases failed, falling back to getPurchases', e);
  }
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });

  const known = new Set(Object.values(PLAY_PRODUCTS).map(p => p.productId));
  const mine = purchases.filter(p => known.has(p.productIdentifier));

  for (const purchase of mine) {
    const plan = (Object.keys(PLAY_PRODUCTS) as PlayPlan[]).find(
      k => PLAY_PRODUCTS[k].productId === purchase.productIdentifier,
    );
    if (!plan) continue;
    const purchaseToken = purchase.purchaseToken || purchase.transactionId;
    if (!purchaseToken) continue;
    try {
      return await verifyPlayPurchase({
        purchaseToken,
        productId: PLAY_PRODUCTS[plan].productId,
        basePlanId: PLAY_PRODUCTS[plan].basePlanId,
      });
    } catch (e) {
      console.warn('[play-billing] purchase failed verification', e);
    }
  }
  // Keep the userId reference meaningful for debugging restores.
  console.log('[play-billing] no verifiable subscription found', { userId, count: mine.length });
  return null;
}

/** Opens the Google Play subscription management screen (cancel / change plan). */
export async function openPlaySubscriptionManagement(): Promise<void> {
  if (!shouldUsePlayBilling()) throw new Error('Not available on this platform');
  const { NativePurchases } = await loadPlugin();
  await NativePurchases.manageSubscriptions();
}
