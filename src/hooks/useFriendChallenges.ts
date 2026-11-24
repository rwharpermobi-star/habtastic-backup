import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { untypedSupabase } from "@/integrations/supabase/untyped";



export interface FriendChallenge {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  code: string;
  status: string;
  start_date: string;
  habit_name: string | null;
  duration_days?: number;
  creator_progress?: number;
  opponent_progress?: number;
  completed_at?: string | null;
  is_challenger: boolean;
}

export function useFriendChallenges() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState<FriendChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChallenges = useCallback(async () => {
    if (!user) {
      setChallenges([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { error: refreshError } = await untypedSupabase.rpc('refresh_my_friend_habit_challenges');
    if (refreshError) console.warn('[friendChallenges] progress refresh failed', refreshError.message);
    const { data, error } = await untypedSupabase
      .from('friend_challenges')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.warn('[friendChallenges] load failed', error.message);
    if (data) {
      setChallenges(data.map((c) => ({
        ...c,
        is_challenger: c.creator_id === user.id,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadChallenges(); }, [loadChallenges]);

  const createChallenge = useCallback(async (message?: string) => {
    if (!user) return null;
    const { data, error } = await untypedSupabase.rpc('create_friend_challenge_code', {
      _message: message?.trim() || null,
    });
    if (error) {
      console.error('[friendChallenges] create code failed', error);
      return null;
    }
    await loadChallenges();
    return typeof data === 'string' ? data : null;
  }, [user, loadChallenges]);

  const createForFriend = useCallback(async (friendId: string, title: string, durationDays: number) => {
    if (!user) return false;
    const { data, error } = await untypedSupabase.rpc('create_friend_habit_challenge', {
      _friend_id: friendId,
      _title: title.trim(),
      _duration_days: durationDays,
    });
    if (error) {
      console.error('[friendChallenges] targeted create failed', error);
      return false;
    }
    if (!(data)?.ok) return false;
    await loadChallenges();
    return true;
  }, [user, loadChallenges]);

  const acceptChallenge = useCallback(async (code: string) => {
    if (!user) return { success: false, error: 'Not logged in' };

    const { data, error } = await untypedSupabase.rpc('accept_friend_challenge', {
      _code: code.trim().toUpperCase(),
    });
    if (error) return { success: false, error: error.message };
    const result = data as { ok?: boolean; error?: string } | null;
    if (!result?.ok) {
      const messages: Record<string, string> = {
        challenge_not_found: 'Challenge code not found or already used.',
        not_friends: 'You must be friends with the challenge creator first.',
        challenge_unavailable: 'This challenge is no longer available.',
      };
      return { success: false, error: messages[result?.error || ''] || 'Could not accept challenge.' };
    }
    await loadChallenges();
    return { success: true, error: null };
  }, [user, loadChallenges]);

  const respondToTarget = useCallback(async (challengeId: string, accept: boolean) => {
    const { data, error } = await untypedSupabase.rpc('respond_friend_habit_challenge', {
      _challenge_id: challengeId,
      _accept: accept,
    });
    if (error || !(data)?.ok) return false;
    await loadChallenges();
    return true;
  }, [loadChallenges]);

  const shareChallenge = useCallback(async (code: string, message?: string) => {
    const text = `⚔️ I challenge you on HabTastic!\n\n${message || "Let's see who has the better Growth Score this week!"}\n\nUse code: ${code}\n\nYou must already be friends on HabTastic before joining. 🏆`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'HabTastic Challenge', text });
      } catch { /* ignore: best effort */ }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }, []);

  return { challenges, loading, createChallenge, createForFriend, acceptChallenge, respondToTarget, shareChallenge, refresh: loadChallenges };
}
