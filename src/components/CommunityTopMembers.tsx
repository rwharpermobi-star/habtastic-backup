import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Avatar from '@/components/Avatar';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface TopMember {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  stage: string;
  stars: number;
}

export default function CommunityTopMembers() {
  const [members, setMembers] = useState<TopMember[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await untypedSupabase
        .rpc('get_community_top_members', { _limit: 5 });

      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setMembers([]);
        return;
      }

      // Use the privacy-filtered RPC response directly. Do not fetch profile
      // rows again, which could reintroduce users who opted out of leaderboards.
      setMembers(data as TopMember[]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (members.length === 0) return null;

  return (
    <div className="glass rounded-card p-3 mb-3 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-4 h-4 text-primary" />
        <p className="text-xs font-bold text-foreground">Community Leaders</p>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
        {members.map((m, i) => (
          <Link key={m.user_id} to={`/u/${m.user_id}`}
            className="flex flex-col items-center min-w-[64px] gap-1 hover:opacity-80">
            <div className="relative">
              <Avatar
                url={m.avatar_url}
                name={m.name || 'User'}
                size={48}
                className="border-2 border-primary/40"
              />
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
            </div>
            <p className="text-[10px] text-foreground truncate max-w-[64px]">{m.name || 'User'}</p>
            <p className="text-[9px] text-muted-foreground">Lv. {m.level} · {m.stars}★</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
