import { formatLocalDate, parseLocalDate, isLocalDate } from '@/lib/habitStore';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Flame, Star, Crown, Trophy, Award, Users, Eye, EyeOff, Ban, VolumeX, Flag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfilePrivacy } from '@/hooks/useProfilePrivacy';
import { useUserModeration } from '@/hooks/useUserModeration';
import { Switch } from '@/components/ui/switch';
import { getRank } from '@/lib/ranks';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface PublicProfile {
  user_id: string;
  name: string;
  avatar_url: string | null;
  xp: number;
  coins: number;
  unlocked_effects: string[];
}

interface ProfileStats {
  current_streak: number;
  longest_streak: number;
  crowns: number;
  wins: number;
  referrals: number;
}

export default function CommunityProfile() {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMe = !userId || userId === user?.id;
  const targetId = userId || user?.id || '';

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ current_streak: 0, longest_streak: 0, crowns: 0, wins: 0, referrals: 0 });
  const [loading, setLoading] = useState(true);
  const { privacy, update } = useProfilePrivacy(targetId);
  const { toggleBlock, toggleMute, report, blocked, muted } = useUserModeration();

  useEffect(() => {
    if (!targetId) return;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('profiles')
        .select('user_id, name, avatar_url, xp, coins, unlocked_effects')
        .eq('user_id', targetId).maybeSingle();
      setProfile(p as PublicProfile);

      // Stats: streaks from habits, crowns, wins, referrals
      const [habitsRes, crownsRes, winsRes, referralsRes] = await Promise.all([
        untypedSupabase.from('habits').select('completions').eq('user_id', targetId),
        untypedSupabase.from('leaderboard_crowns').select('user_id', { count: 'exact', head: true }).eq('user_id', targetId),
        untypedSupabase.from('community_challenge_participants').select('challenge_id', { count: 'exact', head: true }).eq('user_id', targetId).not('completed_at', 'is', null),
        untypedSupabase.from('community_clicks').select('id', { count: 'exact', head: true }).eq('user_id', targetId).eq('platform', 'referral'),
      ]);

      const habits = (habitsRes.data as any[]) || [];
      let current = 0, longest = 0;
      const today = new Date(); today.setHours(0,0,0,0);
      habits.forEach(h => {
        const set = new Set<string>((h.completions || []).filter(isLocalDate));
        // current streak
        let c = 0;
        for (let i = 0; i < 365; i++) {
          const d = new Date(today); d.setDate(d.getDate() - i);
          if (set.has(formatLocalDate(d))) c++; else break;
        }
        if (c > current) current = c;
        // longest
        const sorted = Array.from(set).sort();
        let best = 0, run = 0, prev: Date | null = null;
        sorted.forEach(s => {
          const d = parseLocalDate(s);
          if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) run++; else run = 1;
          if (run > best) best = run; prev = d;
        });
        if (best > longest) longest = best;
      });

      setStats({
        current_streak: current,
        longest_streak: longest,
        crowns: crownsRes.count || 0,
        wins: winsRes.count || 0,
        referrals: referralsRes.count || 0,
      });
      setLoading(false);
    })();
  }, [targetId]);

  const handleReport = async () => {
    const reason = window.prompt('Why are you reporting this user?');
    if (reason && reason.trim()) await report('user', targetId, reason.trim());
  };

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-muted-foreground">Loading profile…</p></div>;
  }

  const rank = getRank(profile.xp);
  const badges = profile.unlocked_effects || [];
  const isBlocked = blocked.has(targetId);
  const isMuted = muted.has(targetId);

  const Stat = ({ icon: Icon, label, value, hidden }: any) => (
    <div className={`glass rounded-card p-3 text-center ${hidden ? 'opacity-40' : ''}`}>
      <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
      <p className="text-base font-bold text-foreground">{hidden ? '—' : value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <motion.div className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {!isMe && (
          <div className="flex gap-1">
            <button onClick={handleReport} className="p-2 rounded-full hover:bg-secondary/50" aria-label="Report"><Flag className="w-4 h-4" /></button>
            <button onClick={() => toggleMute(targetId)} className={`p-2 rounded-full hover:bg-secondary/50 ${isMuted ? 'text-primary' : ''}`} aria-label="Mute"><VolumeX className="w-4 h-4" /></button>
            <button onClick={() => toggleBlock(targetId)} className={`p-2 rounded-full hover:bg-secondary/50 ${isBlocked ? 'text-destructive' : ''}`} aria-label="Block"><Ban className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center mb-5">
        {visibleAvatarUrl(profile.avatar_url) ? (
          <img loading="lazy" decoding="async" src={visibleAvatarUrl(profile.avatar_url) ?? undefined} alt={profile.name} className="w-24 h-24 rounded-full object-cover border-4 border-primary/30" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-3xl">{profile.name?.[0]}</div>
        )}
        <h1 className="font-signature text-2xl sm:text-3xl leading-[1.05] text-foreground mt-2">{profile.name}</h1>
        <p className="text-xs text-muted-foreground">{rank.emoji} {rank.tier}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat icon={Star}   label="XP"             value={profile.xp.toLocaleString()} hidden={!isMe && privacy.hide_xp} />
        <Stat icon={Flame}  label="Current Streak" value={stats.current_streak} hidden={!isMe && privacy.hide_streak} />
        <Stat icon={Flame}  label="Longest Streak" value={stats.longest_streak} hidden={!isMe && privacy.hide_streak} />
        <Stat icon={Crown}  label="Crowns"         value={stats.crowns} hidden={!isMe && privacy.hide_crowns} />
        <Stat icon={Trophy} label="Challenge Wins" value={stats.wins} hidden={!isMe && privacy.hide_wins} />
      </div>

      {(!privacy.hide_referrals || isMe) && (
        <div className={`glass rounded-card p-3 mb-4 flex items-center gap-3 ${(!isMe && privacy.hide_referrals) ? 'opacity-40' : ''}`}>
          <Users className="w-5 h-5 text-primary" />
          <div className="flex-1"><p className="text-xs text-muted-foreground">Referrals</p>
            <p className="text-base font-bold text-foreground">{(!isMe && privacy.hide_referrals) ? '—' : stats.referrals}</p>
          </div>
        </div>
      )}

      {(!privacy.hide_badges || isMe) && badges.length > 0 && (
        <div className="glass rounded-card p-3 mb-4">
          <div className="flex items-center gap-2 mb-2"><Award className="w-4 h-4 text-primary" /><p className="text-xs font-bold">Badges</p></div>
          <div className="flex flex-wrap gap-1.5">
            {badges.map(b => (
              <span key={b} className="text-[11px] bg-secondary px-2 py-1 rounded-full text-foreground">{b.replace(/_/g, ' ')}</span>
            ))}
          </div>
        </div>
      )}

      {isMe && (
        <div className="glass rounded-card p-4 mb-4">
          <p className="text-xs font-bold mb-3 flex items-center gap-2"><EyeOff className="w-4 h-4" /> Privacy controls</p>
          {[
            ['hide_xp', 'Hide XP'],
            ['hide_streak', 'Hide Streaks'],
            ['hide_crowns', 'Hide Crowns'],
            ['hide_badges', 'Hide Badges'],
            ['hide_wins', 'Hide Challenge Wins'],
            ['hide_referrals', 'Hide Referral Count'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-foreground">{label}</span>
              <Switch checked={(privacy)[key]} onCheckedChange={v => update({ [key]: v })} />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
