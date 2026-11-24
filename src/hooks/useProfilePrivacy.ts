import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface ProfilePrivacy {
  hide_xp: boolean;
  hide_coins: boolean;
  hide_streak: boolean;
  hide_crowns: boolean;
  hide_badges: boolean;
  hide_wins: boolean;
  hide_referrals: boolean;
}

const DEFAULT: ProfilePrivacy = {
  hide_xp: false, hide_coins: false, hide_streak: false,
  hide_crowns: false, hide_badges: false, hide_wins: false, hide_referrals: false,
};

export function useProfilePrivacy(userId?: string) {
  const { user } = useAuth();
  const targetId = userId || user?.id;
  const [privacy, setPrivacy] = useState<ProfilePrivacy>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    const { data } = await untypedSupabase
      .from('profile_privacy').select('*').eq('user_id', targetId).maybeSingle();
    setPrivacy(data ? { ...DEFAULT, ...data } : DEFAULT);
    setLoading(false);
  }, [targetId]);

  useEffect(() => { load(); }, [load]);

  const update = useCallback(async (patch: Partial<ProfilePrivacy>) => {
    if (!user) return;
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    const { error } = await untypedSupabase
      .from('profile_privacy')
      .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message);
  }, [user, privacy]);

  return { privacy, loading, update };
}
