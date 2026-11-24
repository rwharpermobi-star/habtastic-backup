import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type MoodEmoji = '😄' | '🙂' | '😐' | '😔' | '😤';

export const MOOD_OPTIONS: { emoji: MoodEmoji; label: string; intensity: number }[] = [
  { emoji: '😄', label: 'Great', intensity: 5 },
  { emoji: '🙂', label: 'Good', intensity: 4 },
  { emoji: '😐', label: 'Okay', intensity: 3 },
  { emoji: '😔', label: 'Low', intensity: 2 },
  { emoji: '😤', label: 'Tough', intensity: 1 },
];

export function useMoodLog() {
  const { user } = useAuth();

  const logMood = useCallback(
    async (mood: MoodEmoji, intensity: number, habitId?: string) => {
      if (!user) return;
      await supabase.from('mood_logs').insert({
        user_id: user.id,
        habit_id: habitId ?? null,
        mood,
        intensity,
      });
    },
    [user],
  );

  return { logMood };
}
