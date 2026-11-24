import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { adsSupported, showRewardedAd } from '@/lib/ads/adService';
import {
  parseRewardStatus,
  startRefusalMessage,
  waitForRewardGrant,
  type WinstonAdRewardStatus,
} from '@/lib/winstonAdReward';

export const winstonAdRewardKey = (userId?: string) => ['winston-ad-reward', userId] as const;

async function fetchStatus(nonce?: string): Promise<WinstonAdRewardStatus> {
  const { data, error } = await supabase.rpc('get_winston_ad_reward_status', nonce ? { _nonce: nonce } : {});
  if (error) throw error;
  return parseRewardStatus(data);
}

/** Today's server-verified ad bonus. Read-only; Premium users never need it. */
export function useWinstonAdBonus(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: winstonAdRewardKey(user?.id),
    queryFn: () => fetchStatus(),
    enabled: !!user && enabled,
    staleTime: 60_000,
  });
}

/**
 * Opt-in "watch an ad for extra Winston messages".
 * The SDK's reward callback is never trusted: messages appear only after
 * Google's signed callback is verified on the server.
 */
export function useWinstonAdReward(adsEnabled: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const status = useWinstonAdBonus(adsEnabled);
  const [watching, setWatching] = useState(false);

  const refresh = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: winstonAdRewardKey(user.id) });
    queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
  }, [queryClient, user]);

  const watchForMessages = useCallback(async () => {
    if (!user || !adsEnabled || !adsSupported() || watching) return;
    setWatching(true);
    try {
      const { data, error } = await supabase.functions.invoke('admob-reward', { body: { action: 'start' } });
      const start = (data ?? {}) as { ok?: boolean; nonce?: string; reason?: string };
      if (error || !start.ok || !start.nonce) {
        toast.info(startRefusalMessage(error ? undefined : start.reason));
        refresh();
        return;
      }

      const earned = await showRewardedAd({ userId: user.id, customData: start.nonce });
      if (!earned) {
        toast.info('No bonus this time — the ad was closed early or none was available.');
        return;
      }

      const nonce = start.nonce;
      const outcome = await waitForRewardGrant(async () => (await fetchStatus(nonce)).sessionStatus);
      refresh();
      if (outcome === 'granted') {
        toast.success(`+${status.data?.perView ?? 3} Winston messages added for today!`);
      } else if (outcome === 'rejected') {
        toast.info("Google couldn't confirm that view, so no messages were added.");
      } else {
        toast.info('Still confirming your ad with Google — your messages will appear shortly.');
        window.setTimeout(refresh, 15_000);
      }
    } finally {
      setWatching(false);
    }
  }, [user, adsEnabled, watching, refresh, status.data?.perView]);

  return {
    available: adsEnabled && adsSupported(),
    status: status.data,
    watching,
    watchForMessages,
  };
}
