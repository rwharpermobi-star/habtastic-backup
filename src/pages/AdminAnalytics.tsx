import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, BarChart3, Users, Activity, Trophy, Facebook, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import Avatar from '@/components/Avatar';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface DauRow { day: string; dau: number }
interface EngRow { day: string; posts: number; reactions: number; comments: number }
interface ChStat { id: string; kind: string; title: string; emoji: string; participants: number; completions: number }
interface FbRow { day: string; clicks: number; unique_users: number }
interface TopMember { user_id: string; reactions_received: number; name?: string; avatar_url?: string | null }

function Card({ title, value, sub, icon: Icon }: any) {
  return (
    <div className="glass rounded-card p-3 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{title}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MiniBars({ data, keyName, color = 'hsl(var(--primary))' }: { data: any[]; keyName: string; color?: string }) {
  if (!data.length) return <p className="text-xs text-muted-foreground">No data</p>;
  const max = Math.max(...data.map(d => d[keyName] || 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {data.slice().reverse().map((d, i) => (
        <div key={i} className="flex-1 rounded-t" style={{ height: `${((d[keyName] || 0) / max) * 100}%`, background: color, minHeight: 2 }} title={`${d.day}: ${d[keyName]}`} />
      ))}
    </div>
  );
}

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [dau, setDau] = useState<DauRow[]>([]);
  const [eng, setEng] = useState<EngRow[]>([]);
  const [chs, setChs] = useState<ChStat[]>([]);
  const [fb, setFb] = useState<FbRow[]>([]);
  const [members, setMembers] = useState<TopMember[]>([]);
  const [openReports, setOpenReports] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: analytics }, m, r] = await Promise.all([
        untypedSupabase.rpc('get_admin_analytics'),
        untypedSupabase.rpc('get_community_top_members', { _limit: 20 }),
        untypedSupabase.from('community_reports').select('id', { count: 'exact', head: true }).in('status', ['open', 'reviewing']),
      ]);
      const a = analytics ?? {};
      setDau((a.community_dau as DauRow[]) || []);
      setEng((a.community_feed_engagement as EngRow[]) || []);
      setChs((a.community_challenge_stats as ChStat[]) || []);
      setFb((a.facebook_conversion_stats as FbRow[]) || []);
      setOpenReports(r.count || 0);

      const rows = (m.data as TopMember[]) || [];
      if (rows.length) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, name, avatar_url').in('user_id', rows.map(r => r.user_id));
        const pmap: Record<string, any> = {};
        profiles?.forEach((p) => { pmap[p.user_id] = p; });
        setMembers(rows.map(r => ({ ...r, ...pmap[r.user_id] })));
      }
    })();
  }, [isAdmin]);


  if (adminLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-muted-foreground">Checking access…</p></div>;
  if (!isAdmin) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Shield className="w-10 h-10 text-muted-foreground mb-2" />
      <p className="text-sm font-semibold">Admins only</p>
      <button onClick={() => navigate('/community')} className="mt-3 text-primary text-sm">← Back to Community</button>
    </div>
  );

  const dauToday = dau[0]?.dau || 0;
  const dauAvg = Math.round((dau.reduce((s, r) => s + r.dau, 0) / Math.max(dau.length, 1)));
  const engToday = eng[0] || { posts: 0, reactions: 0, comments: 0 };
  const fbTotal = fb.reduce((s, r) => s + r.clicks, 0);
  const chTotalP = chs.reduce((s, r) => s + r.participants, 0);
  const chTotalC = chs.reduce((s, r) => s + r.completions, 0);

  return (
    <motion.div className="min-h-screen pb-24 px-5 pt-14 bg-background" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => navigate('/community')} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-h1 text-foreground flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Analytics</h1>
        <button onClick={() => navigate('/admin/moderation')} className="text-xs text-primary flex items-center gap-1">
          <Shield className="w-4 h-4" /> Moderation
          {openReports > 0 && <span className="ml-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">{openReports}</span>}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Card title="DAU today" value={dauToday} sub={`30d avg ${dauAvg}`} icon={Users} />
        <Card title="Open reports" value={openReports} sub="needs review" icon={Shield} />
        <Card title="Posts today" value={engToday.posts} sub={`${engToday.reactions} reactions · ${engToday.comments} comments`} icon={Activity} />
        <Card title="FB clicks (30d)" value={fbTotal} sub="Facebook conversions" icon={Facebook} />
      </div>

      <div className="glass rounded-card p-3 mb-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> DAU (30 days)</p>
        <MiniBars data={dau} keyName="dau" />
      </div>

      <div className="glass rounded-card p-3 mb-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Reactions per day</p>
        <MiniBars data={eng} keyName="reactions" color="hsl(var(--accent))" />
      </div>

      <div className="glass rounded-card p-3 mb-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-primary" /> Challenges</p>
        <p className="text-[11px] text-muted-foreground mb-2">{chTotalP} joins · {chTotalC} completions</p>
        <div className="space-y-1.5">
          {chs.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <span>{c.emoji}</span>
              <span className="text-foreground flex-1 truncate">{c.title}</span>
              <span className="text-muted-foreground">{c.completions}/{c.participants}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-card p-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Most Active Members (30d)</p>
        <div className="space-y-1.5">
          {members.map((m, i) => (
            <div key={m.user_id} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-4">{i + 1}.</span>
              <Avatar url={m.avatar_url ?? null} name={m.name} size={24} />
              <span className="text-foreground flex-1 truncate">{m.name || 'User'}</span>
              <span className="text-muted-foreground">{m.reactions_received} ❤</span>
            </div>
          ))}
          {!members.length && <p className="text-[11px] text-muted-foreground">No activity yet</p>}
        </div>
      </div>
    </motion.div>
  );
}
