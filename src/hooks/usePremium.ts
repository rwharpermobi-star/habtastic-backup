import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import {
  readPremiumCache,
  writePremiumCache,
  type PremiumSnapshot,
} from '@/lib/premiumCache';
import { Plan, FEATURES, FREE_HABIT_LIMIT, FREE_AI_DAILY_LIMIT, TRIAL_AI_DAILY_LIMIT, TRIAL_DAYS, hasAccess, type Feature } from '@/lib/featureGating';
import { useWinstonAdBonus } from '@/hooks/useWinstonAdReward';
import { winstonDailyLimit } from '@/lib/winstonAdReward';

/**
 * Premium gating hook.
 * Every new account gets a 5-day Premium trial. The trial is tied to
 * profiles.trial_started_at and is protected server-side.
 */
export function usePremium() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const queryClient = useQueryClient();

  const cached: PremiumSnapshot | null = readPremiumCache(user?.id);
  const [clock, setClock] = useState(() => Date.now());
  const nowMs = Math.max(clock, Date.now());
  const paidUntil = profile ? profile.premium_until : cached?.premiumUntil;
  const trialStartedMs = profile?.trial_started_at
    ? Date.parse(profile.trial_started_at)
    : NaN;
  const trialEndsMs = trialStartedMs + TRIAL_DAYS * 864e5;

  // Entitlement must expire even when the user leaves this screen open.
  useEffect(() => {
    const refreshClock = () => setClock(Date.now());
    const boundaries = [paidUntil ? Date.parse(paidUntil) : NaN, trialEndsMs]
      .filter(value => Number.isFinite(value) && value > Date.now());
    const timer = boundaries.length
      ? window.setTimeout(refreshClock, Math.min(Math.min(...boundaries) - Date.now() + 1, 2147483647))
      : undefined;
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, [paidUntil, trialEndsMs, clock]);

  useEffect(() => {
    if (!user || !profile) return;
    writePremiumCache(user.id, {
      is_premium: profile.is_premium,
      premium_until: profile.premium_until,
    });
  }, [user, profile, profile?.is_premium, profile?.premium_until]);

  const now = new Date(nowMs);

  const isPaidPremium = (() => {
    if (profile) {
      if (!profile.is_premium) return false;
      if (profile.premium_until && !(Date.parse(profile.premium_until) > nowMs)) return false;
      return true;
    }
    if (!cached?.isPremium) return false;
    if (cached.premiumUntil && !(Date.parse(cached.premiumUntil) > nowMs)) return false;
    return true;
  })();

  const trialStartedAt = profile?.trial_started_at ? new Date(profile.trial_started_at) : null;
  const trialEndDate = trialStartedAt
    ? new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const isTrialing = !isPaidPremium && Number.isFinite(trialStartedMs)
    && trialStartedMs <= nowMs && trialEndsMs > nowMs;
  const trialExpired = !isPaidPremium && !!trialEndDate && trialEndDate <= now;
  const trialDaysLeft = isTrialing && trialEndDate
    ? Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  const nextBillingDate = profile?.premium_until
    ? new Date(profile.premium_until)
    : cached?.premiumUntil ? new Date(cached.premiumUntil) : null;

  const isPremium = isPaidPremium || isTrialing;
  // True only while we genuinely don't know the entitlement yet: auth is still
  // restoring, or the signed-in user's profile is in flight with no cached
  // snapshot for THIS user. Gated UI shows a neutral state instead of a false
  // lock. A failed/missing profile resolves to "not loading" → restricted.
  const entitlementLoading = !!authLoading || (!!user && !profile && !!profileLoading && !cached);
  // When a trial/payment ends we only remove access. We never delete the
  // user's saved Premium progress, so buying Premium later resumes it.
  const premiumProgressLocked = !isPremium && !!(trialStartedAt || profile?.is_premium || cached?.premiumUntil);
  const plan = isPremium ? Plan.PREMIUM : Plan.FREE;
  const canAccess = (feature: Feature) => hasAccess(plan, feature);
  const canAddHabit = (currentCount: number) => isPremium || currentCount < FREE_HABIT_LIMIT;

  // Free limit + today's ad bonus (verified by Google on the server).
  const { data: adBonus } = useWinstonAdBonus(!!profile && !isPremium);
  const aiDailyLimit = winstonDailyLimit(FREE_AI_DAILY_LIMIT, adBonus?.bonusToday ?? 0);

  const canUseAI = () => {
    if (isPremium) return true;
    const today = new Date().toISOString().split('T')[0];
    const used = profile?.last_ai_reset !== today ? 0 : (profile?.daily_ai_messages || 0);
    return used < aiDailyLimit;
  };

  const aiMessagesLeft = () => {
    if (isPremium) return Infinity;
    const today = new Date().toISOString().split('T')[0];
    const used = profile?.last_ai_reset !== today ? 0 : (profile?.daily_ai_messages || 0);
    return Math.max(0, aiDailyLimit - used);
  };

  const trackAIMessage = async () => {
    if (isPaidPremium || !user) return;
    queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
  };

  const startTrial = () => {};
  const hasUsedTrial = () => !!trialStartedAt;

  return {
    isPremium,
    isPaidPremium,
    entitlementLoading,
    isLifetime: false,
    isTrialing,
    trialDaysLeft,
    trialExpired,
    premiumProgressLocked,
    trialEndDate,
    nextBillingDate,
    startTrial,
    hasUsedTrial,
    plan,
    canAccess,
    canAddHabit,
    canUseAI,
    aiMessagesLeft,
    trackAIMessage,
    FREE_HABIT_LIMIT,
    FREE_AI_DAILY_LIMIT,
    aiDailyLimit,
    TRIAL_AI_DAILY_LIMIT,
    TRIAL_DAYS,
    FEATURES,
  };
}
