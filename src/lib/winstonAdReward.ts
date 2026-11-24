/**
 * Opt-in rewarded ads for extra Winston messages (Free users only).
 *
 * The server is the only authority: `admob-reward` issues a one-time code,
 * Google's signed SSV callback (`admob-ssv`) grants the messages, and
 * `consume_ai_message` adds today's verified bonus to the Free limit.
 * These values only drive what the app displays.
 */
export const WINSTON_AD_REWARD_MESSAGES = 3;
export const WINSTON_AD_DAILY_VIEWS = 3;

export type WinstonAdRewardStatus = {
  sessionStatus: 'pending' | 'granted' | 'rejected' | 'expired' | null;
  premium: boolean;
  viewsToday: number;
  viewsLeft: number;
  bonusToday: number;
  perView: number;
  dailyViews: number;
};

export function parseRewardStatus(raw: unknown): WinstonAdRewardStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const s = r.session_status;
  return {
    sessionStatus: s === 'pending' || s === 'granted' || s === 'rejected' || s === 'expired' ? s : null,
    premium: r.premium === true,
    viewsToday: num(r.views_today, 0),
    viewsLeft: num(r.views_left, 0),
    bonusToday: num(r.bonus_today, 0),
    perView: num(r.per_view, WINSTON_AD_REWARD_MESSAGES),
    dailyViews: num(r.daily_views, WINSTON_AD_DAILY_VIEWS),
  };
}

/** Free daily Winston limit including today's server-verified ad bonus. */
export function winstonDailyLimit(baseLimit: number, bonusToday: number): number {
  return baseLimit + Math.max(0, Math.floor(bonusToday || 0));
}

export function startRefusalMessage(reason: string | undefined): string {
  switch (reason) {
    case 'premium':
      return 'You have Premium — Winston is already unlimited.';
    case 'daily_cap':
      return "That's all the bonus messages for today. They reset tomorrow.";
    case 'too_many_pending':
      return 'Give it a minute — your last ad is still being checked.';
    default:
      return "Couldn't start the ad right now. Please try again later.";
  }
}

export type GrantOutcome = 'granted' | 'rejected' | 'pending';

/**
 * Google's SSV callback usually lands within seconds of the ad closing.
 * Poll our own server until it confirms or refuses the view.
 */
export async function waitForRewardGrant(
  fetchStatus: () => Promise<WinstonAdRewardStatus['sessionStatus']>,
  { attempts = 12, intervalMs = 1500, sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms)) } = {},
): Promise<GrantOutcome> {
  for (let i = 0; i < attempts; i++) {
    let status: WinstonAdRewardStatus['sessionStatus'] = null;
    try {
      status = await fetchStatus();
    } catch {
      status = null;
    }
    if (status === 'granted') return 'granted';
    if (status === 'rejected' || status === 'expired') return 'rejected';
    if (i < attempts - 1) await sleep(intervalMs);
  }
  return 'pending';
}
