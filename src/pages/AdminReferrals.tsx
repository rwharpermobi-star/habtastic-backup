import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, RefreshCw, AlertTriangle, Check, Flag, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from '@/hooks/useAdmin';
import { toast } from 'sonner';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface SignalRow {
  signal_id: string;
  referral_id: string;
  referrer_id: string;
  referred_id: string | null;
  signal_type: string;
  weight: number;
  metadata: Record<string, unknown> | null;
  signal_created_at: string;
  referral_code: string | null;
  referrer_name: string | null;
  referred_name: string | null;
  purchase_completed: boolean | null;
  admin_status: 'approved' | 'flagged' | null;
  risk_score: number;
}

function riskColor(score: number) {
  if (score >= 100) return 'bg-destructive/15 text-destructive';
  if (score >= 50) return 'bg-orange-500/15 text-orange-500';
  if (score >= 20) return 'bg-yellow-500/15 text-yellow-500';
  return 'bg-emerald-500/15 text-emerald-500';
}

export default function AdminReferrals() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [rows, setRows] = useState<SignalRow[]>([]);
  const [onlyRisky, setOnlyRisky] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await untypedSupabase.rpc('admin_list_referral_signals', {
      _limit: 200,
      _only_risky: onlyRisky,
    });
    if (error) toast.error(error.message);
    setRows((data as SignalRow[]) || []);
    setLoading(false);
  }, [onlyRisky]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const review = async (referralId: string, status: 'approved' | 'flagged') => {
    setActing(referralId + status);
    const notes =
      status === 'flagged'
        ? window.prompt('Optional notes on why this referral is being flagged:', '') || null
        : null;
    const { error } = await untypedSupabase.rpc('admin_review_referral', {
      _referral_id: referralId,
      _status: status,
      _notes: notes,
    });
    setActing(null);
    if (error) return toast.error(error.message);
    toast.success(`Referral ${status}`);
    load();
  };

  if (adminLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  if (!isAdmin)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Shield className="w-10 h-10 text-muted-foreground mb-2" />
        <p className="text-sm font-semibold">Admins only</p>
        <button onClick={() => navigate('/')} className="mt-3 text-primary text-sm">
          ← Back home
        </button>
      </div>
    );

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-h1 text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Referral Fraud
        </h1>
        <button onClick={load} className="p-1.5 rounded-full hover:bg-secondary/60">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setOnlyRisky(false)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
            !onlyRisky ? 'gradient-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground'
          }`}
        >
          <Filter className="w-3 h-3" /> All signals
        </button>
        <button
          onClick={() => setOnlyRisky(true)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
            onlyRisky ? 'gradient-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground'
          }`}
        >
          <AlertTriangle className="w-3 h-3" /> Risky (score ≥ 50)
        </button>
      </div>

      {loading && <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No signals logged ✨</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.signal_id} className="glass rounded-card p-3 shadow-card">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] uppercase tracking-wide font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10">
                {r.signal_type}
              </span>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${riskColor(r.risk_score)}`}>
                risk {r.risk_score}
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                weight +{r.weight}
              </span>
              {r.admin_status && (
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    r.admin_status === 'approved'
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-destructive/15 text-destructive'
                  }`}
                >
                  {r.admin_status}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(r.signal_created_at), { addSuffix: true })}
              </span>
            </div>
            <p className="text-sm text-foreground">
              <span className="font-semibold">{r.referrer_name || 'Referrer'}</span>{' '}
              <span className="text-muted-foreground">→</span>{' '}
              <span className="font-semibold">{r.referred_name || 'Referred user'}</span>{' '}
              <span className="text-muted-foreground text-[11px]">
                · code {r.referral_code || '—'} · {r.purchase_completed ? 'upgraded' : 'pending'}
              </span>
            </p>
            {r.metadata && Object.keys(r.metadata).length > 0 && (
              <pre className="text-[10px] text-muted-foreground font-mono mt-1 bg-secondary/40 rounded p-2 overflow-x-auto">
                {JSON.stringify(r.metadata, null, 2)}
              </pre>
            )}
            <p className="text-[10px] text-muted-foreground font-mono mt-1">referral: {r.referral_id}</p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <button
                onClick={() => review(r.referral_id, 'approved')}
                disabled={acting === r.referral_id + 'approved'}
                className="text-[11px] bg-emerald-500/90 text-white rounded-full px-3 py-1 flex items-center gap-1 disabled:opacity-50"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={() => review(r.referral_id, 'flagged')}
                disabled={acting === r.referral_id + 'flagged'}
                className="text-[11px] bg-destructive text-destructive-foreground rounded-full px-3 py-1 flex items-center gap-1 disabled:opacity-50"
              >
                <Flag className="w-3 h-3" /> Flag
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
