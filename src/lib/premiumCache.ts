// Local cache for the user's Premium plan so the app can render gated UI
// synchronously on cold start without waiting for /profiles. Source of truth
// remains the `profiles` row — this is a hint that gets refreshed when the
// user opens the Premium (Pricing) page or completes a Paystack flow.

const KEY = 'habtastic:premium:v1';

export type Plan = 'free' | 'premium';

export interface PremiumSnapshot {
  userId: string;
  isPremium: boolean;
  premiumUntil: string | null; // ISO
  plan: Plan;
  cachedAt: number; // epoch ms
}

export function readPremiumCache(userId?: string | null): PremiumSnapshot | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as PremiumSnapshot;
    if (snap.userId !== userId) return null;
    // Auto-expire if premium_until has passed.
    if (snap.isPremium && snap.premiumUntil && new Date(snap.premiumUntil) < new Date()) {
      return { ...snap, isPremium: false, plan: 'free' };
    }
    return snap;
  } catch {
    return null;
  }
}

export function writePremiumCache(
  userId: string,
  data: { is_premium: boolean | null; premium_until: string | null }
) {
  const active =
    !!data.is_premium &&
    (!data.premium_until || new Date(data.premium_until) >= new Date());
  const snap: PremiumSnapshot = {
    userId,
    isPremium: active,
    premiumUntil: data.premium_until ?? null,
    plan: active ? 'premium' : 'free',
    cachedAt: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* storage may be locked / full */
  }
  return snap;
}

export function clearPremiumCache() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
