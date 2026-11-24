import { useEffect, useState } from 'react';
import { Facebook, Users, Sparkles, Gift } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { openFacebookCommunity, FACEBOOK_BRAND_BLUE as FB_BLUE } from '@/lib/facebookCommunity';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

// Static featured (could be moved to DB later)
const FEATURED_POST = {
  title: 'Your 30-day streak deserves a flex 💪',
  body: 'Drop your milestone in the group and tag 3 friends who keep you accountable.',
};
const SPOTLIGHT = { name: 'Asha M.', stat: '120-day streak · Founder' };

export default function FacebookHubCard() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [count, setCount] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);

  const alreadyClaimed = profile?.unlocked_effects?.includes('community_explorer');

  useEffect(() => {
    (async () => {
      const { count: c } = await untypedSupabase
        .from('community_clicks')
        .select('id', { count: 'exact', head: true })
        .eq('platform', 'facebook');
      setCount(c ?? null);
    })();
  }, []);

  const handleJoin = async () => {
    openFacebookCommunity('community-hub-card');
    if (!user || alreadyClaimed) return;
    setClaiming(true);
    const { data, error } = await untypedSupabase.rpc('claim_community_explorer');
    setClaiming(false);
    if (error) return;
    if (data?.already) return;
    toast.success('🎉 Community Explorer unlocked! +50 XP');
  };

  return (
    <div className="glass rounded-card overflow-hidden shadow-card mb-3">
      <button onClick={handleJoin}
        className="w-full p-4 text-left hover:bg-secondary/40 transition flex items-center gap-3"
        style={{ background: `linear-gradient(135deg, ${FB_BLUE}22, transparent)` }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: FB_BLUE }}>
          <Facebook className="w-6 h-6 text-white" fill="white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Join HabTastic AI Community</p>
          <p className="text-[11px] text-muted-foreground">
            {count !== null && count > 0 ? `${count.toLocaleString()}+ habit heroes` : 'Connect with habit heroes'}
          </p>
        </div>
        {!alreadyClaimed && (
          <span className="text-[10px] gradient-primary text-primary-foreground px-2 py-1 rounded-full font-bold flex items-center gap-1">
            <Gift className="w-3 h-3" /> +50 XP
          </span>
        )}
      </button>

      <div className="px-4 pb-3 grid grid-cols-3 gap-2 text-[10px]">
        <div className="flex flex-col items-center text-center gap-0.5">
          <Users className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Daily tips</span>
        </div>
        <div className="flex flex-col items-center text-center gap-0.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Weekly wins</span>
        </div>
        <div className="flex flex-col items-center text-center gap-0.5">
          <Gift className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Member perks</span>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border/40 bg-secondary/20">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">📌 Featured this week</p>
        <p className="text-xs font-semibold text-foreground">{FEATURED_POST.title}</p>
        <p className="text-[11px] text-muted-foreground">{FEATURED_POST.body}</p>
      </div>

      <div className="px-4 py-2.5 border-t border-border/40 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">🌟</div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Spotlight member</p>
          <p className="text-xs font-semibold text-foreground">{SPOTLIGHT.name} <span className="text-muted-foreground font-normal">· {SPOTLIGHT.stat}</span></p>
        </div>
      </div>
    </div>
  );
}
