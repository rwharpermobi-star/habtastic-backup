import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { playXPEarned } from '@/lib/sfx';
import { vibrateMedium } from '@/lib/haptics';
import { syncProfileXpCache } from '@/hooks/profileCache';

interface XPReward {
  amount: number;
  reason: string;
}

/**
 * Display-only mirror of `public.reward_rules`. The server is the single source
 * of truth for how much XP an action is worth — these numbers exist purely so
 * the UI can show something before the RPC resolves. Never sent to the server.
 */
const XP_VALUES = {
  journal_write: 15,
  journal_voice: 20,
  journal_ai_feedback: 10,
  streak_7: 50,
  streak_30: 100,
  streak_100: 150,
} as const;

export type XPRewardType = keyof typeof XP_VALUES;

/**
 * Actions whose proof is a specific owned database row. The server verifies the
 * row exists, belongs to auth.uid(), matches the action, and has not already
 * been rewarded — so `refId` is required and must be a real record id.
 */
const REQUIRES_REF_ID: readonly XPRewardType[] = [
  'journal_write',
  'journal_voice',
  'journal_ai_feedback',
];

const REASONS: Record<XPRewardType, string> = {
  journal_write: 'Journal entry saved!',
  journal_voice: 'Voice note recorded!',
  journal_ai_feedback: 'AI coaching received!',
  streak_7: '7-day streak bonus! 🔥',
  streak_30: '30-day streak bonus! 🏆',
  streak_100: '100-day streak bonus! 👑',
};

export function useXPReward() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingReward, setPendingReward] = useState<XPReward | null>(null);

  /**
   * Claims an XP reward. `refId` is the id of the record that proves the event
   * happened (e.g. the journal entry). Streak milestones need no id: the server
   * recomputes the streak from habit completions and pays each milestone once.
   *
   * Habit rewards are NOT claimable here — useHabits owns them because they
   * need the habit id for server-side completion validation.
   */
  const awardXP = useCallback(async (
    type: XPRewardType,
    opts?: { refId?: string; customReason?: string },
  ) => {
    const customReason = opts?.customReason;

    // Signed-out users get the visual reward only; nothing is persisted.
    if (!user) {
      setPendingReward({ amount: XP_VALUES[type], reason: customReason || REASONS[type] });
      playXPEarned();
      vibrateMedium();
      return;
    }

    if (REQUIRES_REF_ID.includes(type) && !opts?.refId) {
      // Without the source record the server will reject the claim anyway.
      console.warn(`[useXPReward] ${type} requires a refId (source record id); skipping`);
      return;
    }

    let awarded = 0;
    try {
      // The server derives the amount from reward_rules AND verifies the
      // underlying event, so a tampered client can neither inflate the reward
      // nor forge the event.
      const { data, error } = await supabase.rpc('claim_action_reward' as never, {
        _action: type,
        _ref_id: opts?.refId ?? null,
        _ref_key: null,
      } as never);
      if (error) throw error;
      awarded = Number((data as { xp?: number } | null)?.xp ?? 0);
      syncProfileXpCache(queryClient, user.id, awarded);
    } catch (e) {
      // Expected on a repeat claim or an unmet milestone — not user-facing.
      console.warn('[useXPReward] claim_action_reward declined', e);
      syncProfileXpCache(queryClient, user.id, 0);
      return;
    }

    if (awarded === 0) return;
    setPendingReward({ amount: awarded, reason: customReason || REASONS[type] });
    playXPEarned();
    vibrateMedium();
  }, [queryClient, user]);

  const clearReward = useCallback(() => setPendingReward(null), []);

  return { awardXP, pendingReward, clearReward, XP_VALUES };
}
