import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/integrations/supabase/lazyClient';
import { useAuth } from '@/contexts/AuthContext';
import { profileQueryKey } from '@/hooks/profileCache';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

export interface Profile {
  name: string;
  coach_gender: 'male' | 'female' | null;
  xp: number;
  theme: string;
  onboarding_complete: boolean;
  avatar_url: string | null;
  is_premium: boolean;
  premium_until: string | null;
  daily_ai_messages: number;
  last_ai_reset: string | null;
  streak_freezes: number;
  freeze_used_dates: string[];
  coins: number;
  gems: number;
  unlocked_themes: string[];
  unlocked_effects: string[];
  ai_avatar_credits_used: number;
  ai_avatar_credits_reset_at: string;
  trial_started_at: string | null;
}

const PROFILE_FIELDS = 'name, coach_gender, xp, theme, onboarding_complete, avatar_url, is_premium, premium_until, daily_ai_messages, last_ai_reset, streak_freezes, freeze_used_dates, coins, gems, unlocked_themes, unlocked_effects, ai_avatar_credits_used, ai_avatar_credits_reset_at, trial_started_at';

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile = null, isLoading: loading } = useQuery({
    queryKey: profileQueryKey(user?.id),
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await (await getSupabase())
        .from('profiles')
        .select(PROFILE_FIELDS)
        .eq('user_id', user.id)
        .single();
      // Surface real errors so react-query's retry/backoff can handle them.
      // Silently returning null used to leave the app gated on `loading=true`
      // forever if the fetch itself threw.
      if (error && error.code !== 'PGRST116') throw error;
      // Old 2D avatars were removed: treat a saved one as no avatar.
      return data ? { ...(data as Profile), avatar_url: visibleAvatarUrl((data as Profile).avatar_url) } : null;
    },
    enabled: !!user,
    // Subscription webhooks can update server-owned Premium fields while the
    // app is backgrounded. Keep profile data fresh so a stale FREE snapshot
    // cannot leave a paid member locked after returning to the app.
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  /**
   * Fields the client may never write — not even through an RPC. Each one has a
   * dedicated server-authoritative path:
   *   xp / coins / gems      -> claim_action_reward, roll_surprise_reward, spend_my_*
   *   is_premium / until     -> Paystack / Play Billing / referral server paths
   *   streak_freezes, dates  -> use_streak_shield / buy_streak_shield / auto_save_streak_day
   *   daily_ai_messages      -> consume_ai_message
   *   unlocked_*             -> purchase_cosmetic / equip_cosmetic
   */
  const SERVER_ONLY_FIELDS = [
    'is_premium', 'premium_until', 'daily_ai_messages', 'last_ai_reset',
    'streak_freezes', 'freeze_used_dates', 'xp', 'coins', 'gems',
    'unlocked_themes', 'unlocked_effects',
  ] as const;

  /**
   * Client-initiated but server-timestamped. `start_my_trial()` takes NO
   * arguments and writes now() only when trial_started_at is still NULL, so a
   * caller can never backdate/forward-date a trial to self-grant Premium.
   */
  const TRIAL_FIELDS = ['trial_started_at'] as const;

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!user) return;

    const safeUpdates: Record<string, unknown> = {};
    const stateUpdates: Record<string, unknown> = {};
    const rejected: string[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if ((SERVER_ONLY_FIELDS as readonly string[]).includes(key)) {
        rejected.push(key);
      } else if ((TRIAL_FIELDS as readonly string[]).includes(key)) {
        // The value is intentionally discarded — only the intent is honoured.
        stateUpdates[key] = value;
      } else {
        safeUpdates[key] = value;
      }
    }

    if (rejected.length > 0) {
      // Not a thrown error: the server would strip these anyway. Surfacing it
      // loudly here keeps future callsites from silently "working".
      console.warn(
        '[useProfile] refusing to write server-owned fields from the client:',
        rejected.join(', '),
      );
    }

    if (Object.keys(safeUpdates).length > 0) {
      const { error } = await (await getSupabase()).from('profiles').update(safeUpdates as any).eq('user_id', user.id);
      if (error) throw error;
    }

    let trialStartedAt: string | undefined;
    if ('trial_started_at' in stateUpdates) {
      const { data, error } = await (await getSupabase()).rpc('start_my_trial' as never, {} as never);
      if (error) throw error;
      // Reflect the server's timestamp, never the one the caller passed in.
      trialStartedAt = (data as { trial_started_at?: string } | null)?.trial_started_at;
    }

    // Optimistic update — only for what we actually persisted.
    const persisted = { ...safeUpdates } as Partial<Profile>;
    if (trialStartedAt !== undefined) {
      (persisted as { trial_started_at?: string | null }).trial_started_at = trialStartedAt;
    }
    if (Object.keys(persisted).length > 0) {
      queryClient.setQueryData(profileQueryKey(user.id), (prev: Profile | null) =>
        prev ? { ...prev, ...persisted } : prev
      );
    }
  }, [user, queryClient]);


  return { profile, loading, updateProfile };
}
