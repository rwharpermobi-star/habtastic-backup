import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { syncProfileRewardCache } from '@/hooks/profileCache';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export interface ReflectionRow {
  reflection_date: string;
  prompt: string;
  response: string;
  xp_awarded: number;
  coins_awarded: number;
}

export function useDailyReflection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [today, setToday] = useState<ReflectionRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setToday(null); setLoading(false); return; }
    const { data } = await supabase
      .from('daily_reflections')
      .select('*')
      .eq('user_id', user.id)
      .eq('reflection_date', todayISO())
      .maybeSingle();
    setToday((data as ReflectionRow | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (prompt: string, response: string) => {
    const trimmed = response.trim();
    if (trimmed.length < 5) {
      toast.error('Add a little more detail so Winston can give the bonus.');
      return false;
    }
    const { data, error } = await supabase.rpc('submit_daily_reflection', {
      _prompt: prompt,
      _response: trimmed,
    });
    if (error) {
      console.error('reflection error', error);
      toast.error('Could not save reflection. Try again.');
      return false;
    }
    const result = data as { already_reflected: boolean; xp: number; coins: number };
    if (result.already_reflected) {
      toast('You already reflected today — come back tomorrow.');
    } else {
      syncProfileRewardCache(queryClient, user?.id, { xp: result.xp });
      toast.success(`💭 Reflection saved! +${result.xp} XP`);
    }
    await load();
    return true;
  }, [load, queryClient, user?.id]);

  return { today, loading, submit, refetch: load };
}
