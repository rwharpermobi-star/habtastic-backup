import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export interface FriendProfile {
  user_id: string;
  name: string;
  avatar_url: string | null;
  xp: number;
}

export interface PendingRequest {
  id: string;
  from_user_id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface OutgoingRequest {
  id: string;
  to_user_id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
}

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incoming, setIncoming] = useState<PendingRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    const { data: rows } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!rows) { setLoading(false); return; }

    // Collect every other-user-id we need to display
    const otherIds = Array.from(new Set(rows.map(r =>
      r.requester_id === user.id ? r.addressee_id : r.requester_id
    )));

    const profilesById: Record<string, { name: string; avatar_url: string | null; xp: number }> = {};
    if (otherIds.length) {
      // A narrowly scoped SECURITY DEFINER RPC returns only profile fields for
      // users connected to the signed-in user by a friendship/request row.
      // This avoids an empty profile result under restrictive profile RLS,
      // which previously made every missing name display as the generic "Hero".
      const { data: profiles, error: profileError } = await untypedSupabase.rpc('get_friend_display_profiles',
        { _user_ids: otherIds },
      );
      if (profileError) {
        console.error('[useFriends] friend display profiles failed', profileError);
      } else {
        (profiles as any[] | null)?.forEach(p => {
          profilesById[p.user_id] = {
            name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'HabTastic User',
            avatar_url: p.avatar_url ?? null,
            xp: Number.isFinite(p.xp) ? p.xp : 0,
          };
        });
      }
    }

    const accepted: FriendProfile[] = [];
    const incomingList: PendingRequest[] = [];
    const outgoingList: OutgoingRequest[] = [];

    for (const r of rows) {
      const isOutgoing = r.requester_id === user.id;
      const otherId = isOutgoing ? r.addressee_id : r.requester_id;
      const p = profilesById[otherId] ?? { name: 'HabTastic User', avatar_url: null, xp: 0 };

      if (r.status === 'accepted') {
        accepted.push({ user_id: otherId, name: p.name, avatar_url: p.avatar_url, xp: p.xp });
      } else if (r.status === 'pending') {
        if (isOutgoing) {
          outgoingList.push({ id: r.id, to_user_id: otherId, name: p.name, avatar_url: p.avatar_url, created_at: r.created_at });
        } else {
          incomingList.push({ id: r.id, from_user_id: otherId, name: p.name, avatar_url: p.avatar_url, created_at: r.created_at });
        }
      }
    }

    setFriends(accepted);
    setIncoming(incomingList);
    setOutgoing(outgoingList);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const sendRequestByCode = useCallback(async (code: string) => {
    if (!user) return false;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast.error('Enter a Friend Code');
      return false;
    }
    setSending(true);
    try {
      // This RPC validates a dedicated friend code and creates a pending request.
      // It never queries or redeems the referrals table.
      const { data, error } = await untypedSupabase.rpc('send_friend_request', {
        _code: trimmed,
      });
      if (error) {
        console.error('[useFriends] send request failed', error);
        toast.error('Could not send the request. Please try again.');
        return false;
      }
      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) {
        const messages: Record<string, string> = {
          code_not_found: 'Friend Code not found. Check the code and try again.',
          self_request: "That's your own Friend Code.",
          already_friends: 'You are already friends.',
          request_pending: 'You already sent this friend request.',
          incoming_pending: 'This user already sent you a request. Check Pending Requests.',
          previously_declined: 'This request was previously declined.',
          requests_disabled: 'This user is not accepting friend requests.',
          not_available: 'This account is not available for friend requests.',
        };
        toast.error(messages[result?.error || ''] || 'Friend request could not be sent.');
        return false;
      }
      toast.success('Friend request sent 📨');
      await load();
      return true;
    } finally {
      setSending(false);
    }
  }, [user, load]);

  const respond = useCallback(async (id: string, accept: boolean) => {
    if (!user) return;
    const { data, error } = await untypedSupabase.rpc('respond_friend_request', {
      _request_id: id,
      _accept: accept,
    });
    if (error || !(data)?.ok) {
      toast.error('Could not update this friend request. Refresh and try again.');
      return;
    }
    toast.success(accept ? 'Friend added 🎉' : 'Request declined');
    await load();
  }, [user, load]);

  const cancelOutgoing = useCallback(async (id: string) => {
    const { data, error } = await untypedSupabase.rpc('cancel_friend_request', {
      _request_id: id,
    });
    if (error || !(data)?.ok) {
      toast.error('Could not cancel this friend request.');
      return;
    }
    toast.success('Request cancelled');
    await load();
  }, [load]);

  const unfriend = useCallback(async (otherId: string) => {
    if (!user) return;
    const { data, error } = await untypedSupabase.rpc('remove_friend', {
      _other_user_id: otherId,
    });
    if (error || !(data)?.ok) {
      toast.error('Could not remove this friend.');
      return;
    }
    toast.success('Removed friend');
    await load();
  }, [user, load]);

  return {
    friends, incoming, outgoing, loading, sending,
    sendRequestByCode, respond, cancelOutgoing, unfriend,
    refresh: load,
  };
}
