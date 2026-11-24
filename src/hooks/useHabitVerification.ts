import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { syncProfileRewardCache } from '@/hooks/profileCache';

export interface VerificationResult {
  already_verified: boolean;
  xp: number;
  coins: number;
}

/**
 * Submit a Winston habit verification answer.
 * Server-side RPC validates ownership, length, and idempotency (1/day/habit).
 */
export function useHabitVerification() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const submit = useCallback(async (
    habitId: string,
    completedDate: string,
    question: string,
    response: string,
  ): Promise<VerificationResult | null> => {
    const trimmed = response.trim();
    if (trimmed.length < 3) {
      toast.error('Please write a few words so Winston can give you the bonus.');
      return null;
    }
    const { data, error } = await supabase.rpc('submit_habit_verification', {
      _habit_id: habitId,
      _completed_date: completedDate,
      _question: question,
      _response: trimmed,
    });
    if (error) {
      console.error('verification error', error);
      toast.error('Could not save your answer. Try again.');
      return null;
    }
    const result = data as unknown as VerificationResult;
    if (result.already_verified) {
      toast('Already verified today — bonus already awarded.');
    } else if (result.xp > 0) {
      syncProfileRewardCache(queryClient, user?.id, { xp: result.xp });
      toast.success(`🎯 Verification bonus! +${result.xp} XP`);
    }
    return result;
  }, [queryClient, user?.id]);

  return { submit };
}
