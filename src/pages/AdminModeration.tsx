import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Trash2, UserX, RefreshCw, BarChart3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface Report {
  id: string;
  reporter_id: string;
  target_type: 'post' | 'comment' | 'user';
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
  resolution_notes: string | null;
}

export default function AdminModeration() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = untypedSupabase.from('community_reports').select('*').order('created_at', { ascending: false }).limit(100);
    if (filter === 'open') q = q.in('status', ['open', 'reviewing']);
    const { data, error } = await q;
    if (error) {
      toast.error(`Could not load reports: ${error.message}`);
      setReports([]);
    } else {
      setReports((data as Report[]) || []);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const resolve = async (id: string, status: 'resolved' | 'dismissed') => {
    const { error } = await untypedSupabase.rpc('admin_resolve_report', { _id: id, _status: status, _notes: '' });
    if (error) return toast.error(error.message);
    toast.success(`Report ${status}`);
    load();
  };

  const remove = async (r: Report) => {
    if (r.target_type === 'post') {
      const { error } = await untypedSupabase.rpc('admin_hide_feed', { _feed_id: r.target_id });
      if (error) return toast.error(error.message);
    } else if (r.target_type === 'comment') {
      const { error } = await untypedSupabase.rpc('admin_hide_comment', { _comment_id: r.target_id });
      if (error) return toast.error(error.message);
    }
    toast.success('Content removed');
    await resolve(r.id, 'resolved');
  };

  const suspend = async (r: Report) => {
    const hoursStr = window.prompt('Suspend for how many hours? (0 to unsuspend)', '24');
    if (hoursStr === null) return;
    const hours = Number(hoursStr);
    if (!Number.isInteger(hours) || hours < 0 || hours > 8760) {
      return toast.error('Enter a whole number from 0 to 8760 hours');
    }

    let userId: string | null = null;
    if (r.target_type === 'user') {
      userId = r.target_id;
    } else if (r.target_type === 'post') {
      const { data, error } = await untypedSupabase
        .from('community_feed').select('user_id').eq('id', r.target_id).maybeSingle();
      if (error) return toast.error(`Could not find post owner: ${error.message}`);
      userId = data?.user_id ?? null;
    } else {
      const { data, error } = await untypedSupabase
        .from('community_feed_comments').select('user_id').eq('id', r.target_id).maybeSingle();
      if (error) return toast.error(`Could not find comment owner: ${error.message}`);
      userId = data?.user_id ?? null;
    }

    if (!userId) return toast.error('Could not identify the reported user. No suspension was applied.');
    const { error } = await untypedSupabase.rpc('admin_suspend_user', { _user_id: userId, _hours: hours });
    if (error) return toast.error(error.message);
    toast.success(hours === 0 ? 'User unsuspended' : `Suspended reported user for ${hours}h`);
  };

  if (adminLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-sm text-muted-foreground">Checking access…</p></div>;
  if (!isAdmin) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Shield className="w-10 h-10 text-muted-foreground mb-2" />
      <p className="text-sm font-semibold">Admins only</p>
      <button onClick={() => navigate('/community')} className="mt-3 text-primary text-sm">← Back to Community</button>
    </div>
  );

  return (
    <motion.div className="min-h-screen pb-24 px-5 pt-14 bg-background" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <button onClick={() => navigate('/community')} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-h1 text-foreground flex items-center gap-2"><Shield className="w-6 h-6 text-primary" /> Moderation</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/referrals')} className="text-xs text-primary flex items-center gap-1"><Shield className="w-4 h-4" /> Referrals</button>
          <button onClick={() => navigate('/admin/analytics')} className="text-xs text-primary flex items-center gap-1"><BarChart3 className="w-4 h-4" /> Analytics</button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {(['open', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === f ? 'gradient-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground'}`}>
            {f === 'open' ? 'Open' : 'All'}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 rounded-full hover:bg-secondary/60"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading && <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>}
      {!loading && reports.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">All clear ✨</p>}

      <div className="space-y-2">
        {reports.map(r => (
          <div key={r.id} className="glass rounded-card p-3 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wide font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10">{r.target_type}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.status}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
            </div>
            <p className="text-sm text-foreground">{r.reason}</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">target: {r.target_id}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              {r.target_type !== 'user' && (
                <button onClick={() => remove(r)} className="text-[11px] bg-destructive text-destructive-foreground rounded-full px-3 py-1 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Remove content
                </button>
              )}
              <button onClick={() => suspend(r)} className="text-[11px] bg-secondary rounded-full px-3 py-1 flex items-center gap-1">
                <UserX className="w-3 h-3" /> Suspend user
              </button>
              <button onClick={() => resolve(r.id, 'resolved')} className="text-[11px] bg-secondary rounded-full px-3 py-1">Resolve</button>
              <button onClick={() => resolve(r.id, 'dismissed')} className="text-[11px] bg-secondary rounded-full px-3 py-1">Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
