import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { playCoinDrop } from '@/lib/sfx';
import { vibrateHeavy } from '@/lib/haptics';
import { syncProfileRewardCache } from '@/hooks/profileCache';

export type SurpriseRewardType = 'coins' | 'gems' | 'xp' | 'streak_freeze' | 'nothing';

export interface SurpriseReward {
  type: SurpriseRewardType;
  amount: number;
  emoji: string;
  label: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

interface ServerRoll {
  type: 'xp' | 'streak_freeze';
  amount: number;
  rarity: SurpriseReward['rarity'];
}

/** Presentation for a roll the server already decided and already applied. */
function present(roll: ServerRoll): SurpriseReward {
  if (roll.type === 'streak_freeze') {
    return {
      type: 'streak_freeze',
      amount: roll.amount,
      emoji: '🛡️',
      label: `+${roll.amount} Streak Shield`,
      rarity: roll.rarity,
    };
  }
  const emoji = roll.rarity === 'epic' ? '🏆' : roll.rarity === 'rare' ? '🌟' : '⚡';
  return { type: 'xp', amount: roll.amount, emoji, label: `+${roll.amount} XP`, rarity: roll.rarity };
}

export function useSurpriseReward() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeReward, setActiveReward] = useState<SurpriseReward | null>(null);
  const processingRef = useRef(false);

  /**
   * The drop chance, the weighted table and the grant all live in
   * `public.roll_surprise_reward()`. The client only renders the outcome — it
   * cannot re-roll for a better prize or claim one it never won.
   */
  const tryReward = useCallback(async (): Promise<SurpriseReward | null> => {
    if (processingRef.current || !user) return null;
    processingRef.current = true;

    try {
      const { data, error } = await supabase.rpc('roll_surprise_reward' as never, {} as never);
      if (error) throw error;
      // `not_eligible` means no habit-completion eligibility was banked. It's a
      // normal outcome, not an error — surprise rolls are earned, not farmed.
      const roll = (data as { reward?: ServerRoll | null } | null)?.reward;
      if (!roll) return null;

      const reward = present(roll);
      if (reward.type === 'xp') {
        syncProfileRewardCache(queryClient, user.id, { xp: reward.amount });
      } else {
        queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      }

      // Common drops are deliberately silent: the XP/progress bar already
      // reflects them. Reserve interruptive reward UI for genuinely uncommon
      // moments so habit completion does not become a stack of popups.
      if (reward.rarity !== 'common') {
        playCoinDrop();
        vibrateHeavy();
        setActiveReward(reward);
      }
      return reward;
    } catch (e) {
      console.warn('[useSurpriseReward] roll_surprise_reward failed', e);
      return null;
    } finally {
      processingRef.current = false;
    }
  }, [user, queryClient]);

  const dismissReward = useCallback(() => setActiveReward(null), []);

  return { tryReward, activeReward, dismissReward };
}
