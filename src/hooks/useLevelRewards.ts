import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface GrantedLevelReward {
  level: number;
  coins: number;
  cosmetic_id: string | null;
  streak_savers: number;
  badge: string | null;
  label: string;
}

interface ClaimResult {
  level: number;
  stars: number;
  stage: string;
  granted: GrantedLevelReward[];
}

/**
 * Claims any level rewards the user has earned.
 *
 * The server derives the level from `profiles.xp`, inserts claim rows with
 * `ON CONFLICT DO NOTHING` and pays out ONLY the rows it actually inserted —
 * so double taps, retries and concurrent calls can never duplicate coins,
 * cosmetics or streak savers. Backfilled rows (existing users' already-passed
 * levels) are already present, so they never pay out retroactively.
 */
export function useLevelRewards() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const claim = useCallback(async (): Promise<GrantedLevelReward[]> => {
    if (!user) return [];
    const { data, error } = await supabase.rpc('claim_level_rewards');
    if (error) {
      console.warn('[useLevelRewards] claim failed', error.message);
      return [];
    }
    const result = (data as unknown as ClaimResult | null) ?? null;
    const granted = result?.granted ?? [];
    if (granted.length > 0) {
      // Coins / streak savers live on the profile; cosmetics on their own caches.
      qc.invalidateQueries({ queryKey: ['profile', user.id] });
      qc.invalidateQueries({ queryKey: ['cosmetics-owned'] });
      qc.invalidateQueries({ queryKey: ['cosmetics-catalog'] });
    }
    return granted;
  }, [user, qc]);

  return { claim };
}
