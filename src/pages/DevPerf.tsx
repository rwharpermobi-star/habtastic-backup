import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gauge, Zap, Network, Package, RefreshCw, Target } from 'lucide-react';
import {
  getPerfSnapshot,
  percentile,
  enablePerfMonitor,
  isPerfMonitorEnabled,
  type PerfSnapshot,
} from '@/lib/perfMonitor';
import { evaluateBudgets, formatBudgetValue, formatBudgetLimit } from '@/lib/perfBudgets';

function fmtMs(n: number | null) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}
function fmtKb(n: number) { return `${(n / 1024).toFixed(1)} kB`; }

function Stat({ icon: Icon, label, value, sub }: any) {
  return (
    <div className="glass rounded-card p-3 shadow-card">
      <div className="flex items-center gap-2 mb-1 text-muted-foreground">
        <Icon className="w-4 h-4 text-primary" />
        <p className="text-[10px] uppercase tracking-wide font-bold">{label}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function DevPerf() {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<PerfSnapshot>(() => getPerfSnapshot());
  const [enabled, setEnabled] = useState(isPerfMonitorEnabled());

  useEffect(() => {
    const t = setInterval(() => setSnap(getPerfSnapshot()), 1500);
    return () => clearInterval(t);
  }, []);

  const durations = snap.api.map((a) => a.duration);
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const slowest = [...snap.api].sort((a, b) => b.duration - a.duration).slice(0, 8);

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center justify-between mb-3">
        <h1 className="text-h1 text-foreground flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary" /> Performance
        </h1>
        <button
          onClick={() => setSnap(getPerfSnapshot())}
          className="text-xs text-primary flex items-center gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => { enablePerfMonitor(e.target.checked); setEnabled(e.target.checked); }}
        />
        Enable monitoring in production (next reload)
      </label>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat icon={Zap} label="FCP" value={fmtMs(snap.fcp)} sub="First Contentful Paint" />
        <Stat icon={Zap} label="LCP" value={fmtMs(snap.lcp)} sub="Largest Contentful Paint" />
        <Stat icon={Gauge} label="TTI (proxy)" value={fmtMs(snap.tti)} sub="5s idle after FCP" />
        <Stat icon={Network} label="API p95" value={fmtMs(p95)} sub={`p50 ${fmtMs(p50)} · ${snap.api.length} samples`} />
      </div>

      <div className="glass rounded-card p-3 mb-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> Performance budgets
        </p>
        <div className="space-y-1.5">
          {evaluateBudgets(snap).map((b) => (
            <div key={b.budget.key} className="flex items-center gap-2 text-[11px]">
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${
                  b.value == null
                    ? 'bg-muted text-muted-foreground'
                    : b.passing
                    ? 'bg-green-500/15 text-green-500'
                    : 'bg-destructive/15 text-destructive'
                }`}
              >
                {b.value == null ? '—' : b.passing ? 'OK' : 'OVER'}
              </span>
              <span className="text-foreground flex-1 truncate">{b.budget.label}</span>
              <span className="text-muted-foreground">
                {formatBudgetValue(b)} / {formatBudgetLimit(b)}
              </span>
            </div>
          ))}
        </div>
      </div>


      <div className="glass rounded-card p-3 mb-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" /> Slowest API calls
        </p>
        {slowest.length === 0 && <p className="text-[11px] text-muted-foreground">No samples yet</p>}
        <div className="space-y-1.5">
          {slowest.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground w-12">{a.duration}ms</span>
              <span className="text-foreground flex-1 truncate" title={a.url}>{a.url}</span>
              <span className="text-muted-foreground">{fmtKb(a.size)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-card p-3 shadow-card">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" /> Largest JS bundles
        </p>
        {snap.scripts.length === 0 && <p className="text-[11px] text-muted-foreground">No samples yet</p>}
        <div className="space-y-1.5">
          {snap.scripts.slice(0, 10).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground w-16">{fmtKb(s.transferSize)}</span>
              <span className="text-foreground flex-1 truncate" title={s.url}>
                {s.url.split('/').pop()}
              </span>
              <span className="text-muted-foreground">{s.duration}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
