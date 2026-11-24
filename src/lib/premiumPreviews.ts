/**
 * Premium perk cards shown on the Premium (Pricing) page.
 *
 * The lock state is derived ONLY from the server-backed entitlement exposed by
 * `usePremium()` (profiles.is_premium / premium_until, written exclusively by
 * Paystack / Google Play / referral server paths, or an active server-stamped
 * trial). It is never hard-coded and never read from client-writable data.
 */
export type PremiumPreviewId =
  | 'avatar-drops'
  | 'exclusive-themes'
  | 'premium-badges'
  | 'ai-weekly-reports'
  | 'leaderboard-rewards'
  | 'bonus-chest-loot';

export interface PremiumPreview {
  id: PremiumPreviewId;
  tag: string;
  title: string;
  /**
   * Only set when the destination is genuinely Premium-gated today. Cards
   * without a route are informational previews and never navigate.
   */
  route?: string;
}

export const PREMIUM_PREVIEWS: readonly PremiumPreview[] = [
  { id: 'avatar-drops', tag: 'Cosmetics', title: 'Premium Avatar Drops' },
  { id: 'exclusive-themes', tag: 'Themes', title: 'Exclusive Themes', route: '/settings/appearance' },
  { id: 'premium-badges', tag: 'Badges', title: 'Premium Badges' },
  { id: 'ai-weekly-reports', tag: 'Reports', title: 'AI Weekly Reports' },
  { id: 'leaderboard-rewards', tag: 'Leaderboard', title: 'Leaderboard Rewards' },
  { id: 'bonus-chest-loot', tag: 'Rewards', title: 'Bonus Chest Loot' },
] as const;

export const PREMIUM_PREVIEW_INCLUDED_LABEL = 'Included with Premium';

export type PremiumPreviewState = 'loading' | 'unlocked' | 'locked';

/**
 * While entitlement is still being confirmed we show a neutral state, so a
 * Premium member never sees a false lock and a free user never sees a false
 * unlock. Once known, only an active paid subscription unlocks the cards.
 */
export function premiumPreviewState(input: {
  entitlementLoading: boolean;
  /** Paying Premium only — trials and bonus days keep the teaser. */
  isPaidPremium: boolean;
}): PremiumPreviewState {
  if (input.entitlementLoading) return 'loading';
  return input.isPaidPremium ? 'unlocked' : 'locked';
}
