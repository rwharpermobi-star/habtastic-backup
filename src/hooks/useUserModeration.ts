import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export function useUserModeration() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: b }, { data: m }] = await Promise.all([
      untypedSupabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id),
      untypedSupabase.from('user_mutes').select('muted_id').eq('muter_id', user.id),
    ]);
    setBlocked(new Set((b as any[])?.map(r => r.blocked_id) || []));
    setMuted(new Set((m as any[])?.map(r => r.muted_id) || []));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleBlock = useCallback(async (targetId: string) => {
    const { data, error } = await untypedSupabase.rpc('toggle_block', { _target: targetId });
    if (error) { toast.error(error.message); return; }
    toast.success(data ? 'User blocked' : 'User unblocked');
    await load();
  }, [load]);

  const toggleMute = useCallback(async (targetId: string) => {
    const { data, error } = await untypedSupabase.rpc('toggle_mute', { _target: targetId });
    if (error) { toast.error(error.message); return; }
    toast.success(data ? 'User muted' : 'User unmuted');
    await load();
  }, [load]);

  const report = useCallback(async (type: 'post' | 'comment' | 'user', id: string, reason: string) => {
    const { error } = await untypedSupabase.rpc('report_content', {
      _target_type: type, _target_id: id, _reason: reason,
    });
    if (error) { toast.error(error.message); return false; }
    toast.success('Report submitted. Thank you.');
    return true;
  }, []);

  return { blocked, muted, toggleBlock, toggleMute, report, refresh: load };
}
