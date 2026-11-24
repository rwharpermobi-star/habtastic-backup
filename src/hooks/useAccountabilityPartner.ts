import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface Partnership {
  id: string;
  requester_id: string;
  partner_id: string;
  status: 'pending' | 'accepted' | 'ended';
  accepted_at: string | null;
  created_at: string;
  other: { user_id: string; name: string; avatar_url: string | null; xp: number };
  isOutgoing: boolean;
}

export interface PartnerCheckin {
  id: string;
  user_id: string;
  week_start: string;
  message: string;
  created_at: string;
}

function getWeekStart(d = new Date()): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split('T')[0];
}

export function useAccountabilityPartner() {
  const { user } = useAuth();
  const [partnership, setPartnership] = useState<Partnership | null>(null);
  const [pendingIn, setPendingIn] = useState<Partnership[]>([]);
  const [pendingOut, setPendingOut] = useState<Partnership[]>([]);
  const [checkins, setCheckins] = useState<PartnerCheckin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const { data: rows } = await supabase
      .from('accountability_partners')
      .select('*')
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
      .in('status', ['pending', 'accepted']);

    const otherIds = Array.from(new Set((rows || []).map((r) =>
      r.requester_id === user.id ? r.partner_id : r.requester_id
    )));
    const pmap: Record<string, unknown> = {};
    if (otherIds.length) {
      const { data: profiles } = await supabase
        .from('profiles').select('user_id, name, avatar_url, xp').in('user_id', otherIds);
      profiles?.forEach((p) => { pmap[p.user_id] = p; });
    }

    const accepted: Partnership[] = [];
    const incoming: Partnership[] = [];
    const outgoing: Partnership[] = [];
    (rows || []).forEach((r: any) => {
      const isOutgoing = r.requester_id === user.id;
      const otherId = isOutgoing ? r.partner_id : r.requester_id;
      const other = pmap[otherId] || { user_id: otherId, name: 'Hero', avatar_url: null, xp: 0 };
      const p: Partnership = { ...r, other, isOutgoing };
      if (r.status === 'accepted') accepted.push(p);
      else if (isOutgoing) outgoing.push(p);
      else incoming.push(p);
    });

    setPartnership(accepted[0] || null);
    setPendingIn(incoming);
    setPendingOut(outgoing);

    if (accepted[0]) {
      const { data: ci } = await supabase
        .from('partner_checkins')
        .select('*')
        .eq('partnership_id', accepted[0].id)
        .order('created_at', { ascending: false })
        .limit(20);
      setCheckins((ci) || []);
    } else {
      setCheckins([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const requestPartner = useCallback(async (friendUserId: string) => {
    if (!user) return false;
    if (partnership) { toast.error('You already have a partner. End it first.'); return false; }
    const { error } = await supabase.from('accountability_partners').insert({
      requester_id: user.id, partner_id: friendUserId, status: 'pending',
    });
    if (error) { toast.error(error.message); return false; }
    toast.success('Partner request sent 🤝');
    await load();
    return true;
  }, [user, partnership, load]);

  const respond = useCallback(async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc('respond_partner_request', {
      _partnership_id: id, _accept: accept,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(accept ? 'Partner accepted 🎉' : 'Declined');
    await load();
  }, [load]);

  const endPartnership = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc('end_partnership', { _partnership_id: id });
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      toast.error('Could not end this partnership. Please try again.');
      return;
    }
    toast.success('Partnership ended');
    await load();
  }, [load]);

  const postCheckin = useCallback(async (message: string) => {
    if (!user || !partnership) return;
    const week_start = getWeekStart();
    const { error } = await supabase.from('partner_checkins').insert({
      partnership_id: partnership.id,
      user_id: user.id,
      week_start,
      message: message.trim().slice(0, 500),
    });
    if (error) {
      if (error.code === '23505') toast.error('Already checked in this week');
      else toast.error(error.message);
      return false;
    }
    toast.success('Check-in posted 💬');
    await load();
    return true;
  }, [user, partnership, load]);

  return {
    partnership, pendingIn, pendingOut, checkins, loading,
    requestPartner, respond, endPartnership, postCheckin, refresh: load,
    weekStart: getWeekStart(),
  };
}
