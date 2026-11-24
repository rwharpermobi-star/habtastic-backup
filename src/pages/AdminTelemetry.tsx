import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Activity, Gauge, Target, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { SLOS, evaluateSlo, STATUS_STYLES, ALERT_RULES } from "@/lib/slo";
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface Row {
  id: number;
  created_at: string;
  kind: "error" | "perf" | "event";
  category: string | null;
  level: string | null;
  message: string | null;
  route: string | null;
  app_version: string | null;
  fcp_ms: number | null;
  lcp_ms: number | null;
  tti_ms: number | null;
  api_p95_ms: number | null;
  context;
}

function avg(nums: number[]) {
  const xs = nums.filter((n): n is number => typeof n === "number" && n > 0);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
}

function percentile(nums: number[], p: number) {
  const xs = nums.filter((n): n is number => typeof n === "number" && n > 0).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const idx = Math.min(xs.length - 1, Math.floor((p / 100) * xs.length));
  return Math.round(xs[idx]);
}

function routeMatches(route: string | null, needles: string[]) {
  if (!route) return false;
  return needles.some((n) => route.includes(n));
}

export default function AdminTelemetry() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"errors" | "perf">("errors");

  useEffect(() => {
    if (adminLoading || !isAdmin) return;
    (async () => {
      const { data } = await untypedSupabase
        .from("client_telemetry_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, [isAdmin, adminLoading]);

  const errors = useMemo(() => rows.filter((r) => r.kind === "error"), [rows]);
  const perf = useMemo(() => rows.filter((r) => r.kind === "perf"), [rows]);

  const last24h = (r: Row) => Date.now() - new Date(r.created_at).getTime() < 86400000;
  const last1h = (r: Row) => Date.now() - new Date(r.created_at).getTime() < 3600000;

  const stats = useMemo(() => ({
    fcp: avg(perf.map((p) => p.fcp_ms ?? 0)),
    lcp: avg(perf.map((p) => p.lcp_ms ?? 0)),
    tti: avg(perf.map((p) => p.tti_ms ?? 0)),
    p95: avg(perf.map((p) => p.api_p95_ms ?? 0)),
    errors24h: errors.filter(last24h).length,
    errors1h: errors.filter(last1h).length,
    total24h: rows.filter(last24h).length,
  }), [perf, errors, rows]);

  // Per-flow SLI computation against the SLO catalog.
  const sloActuals = useMemo<Record<string, number | null>>(() => {
    const onboardingPerf = perf.filter((p) => routeMatches(p.route, ["/onboarding", "/auth", "/"]));
    const habitPerf = perf.filter((p) => routeMatches(p.route, ["/habits", "/dashboard"]));
    const habitErrors24h = errors.filter((e) => last24h(e) && routeMatches(e.route, ["/habits", "/dashboard"])).length;
    const habitTotal24h = rows.filter((r) => last24h(r) && routeMatches(r.route, ["/habits", "/dashboard"])).length;
    const coachPerf = perf.filter((p) => routeMatches(p.route, ["/coach"]));
    const coachErrors24h = errors.filter((e) => last24h(e) && routeMatches(e.route, ["/coach"])).length;
    const coachTotal24h = rows.filter((r) => last24h(r) && routeMatches(r.route, ["/coach"])).length;
    const onbErrors24h = errors.filter((e) => last24h(e) && routeMatches(e.route, ["/onboarding", "/auth"])).length;
    const onbTotal24h = Math.max(rows.filter((r) => last24h(r) && routeMatches(r.route, ["/onboarding", "/auth"])).length, 1);
    return {
      onboarding_lcp: percentile(onboardingPerf.map((p) => p.lcp_ms ?? 0), 75) || null,
      onboarding_error_rate: (onbErrors24h / onbTotal24h) * 100,
      habit_completion_api: percentile(habitPerf.map((p) => p.api_p95_ms ?? 0), 95) || null,
      habit_completion_success: habitTotal24h ? 100 - (habitErrors24h / habitTotal24h) * 100 : null,
      coach_chat_first_token: percentile(coachPerf.map((p) => p.api_p95_ms ?? 0), 95) || null,
      coach_chat_error_rate: coachTotal24h ? (coachErrors24h / coachTotal24h) * 100 : 0,
    };
  }, [perf, errors, rows]);

  // Live alerts (also surface on dashboard).
  const activeAlerts = useMemo(() => {
    const input = {
      errors24h: stats.errors24h,
      errors1h: stats.errors1h,
      totalEvents24h: stats.total24h,
      apiP95Ms: stats.p95,
      lcpMs: stats.lcp,
    };
    return ALERT_RULES.flatMap((rule) => {
      const reason = rule.evaluate(input);
      return reason ? [{ id: rule.id, label: rule.label, reason }] : [];
    });
  }, [stats]);

  if (adminLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <div className="p-6 text-muted-foreground">Admins only.</div>;

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-h1 text-foreground flex items-center gap-2 mb-4">
        <Activity className="w-6 h-6 text-primary" /> Telemetry
      </h1>

      {activeAlerts.length > 0 && (
        <div className="mb-4 rounded-card border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs font-bold text-destructive flex items-center gap-1 mb-2">
            <Bell className="w-3 h-3" /> {activeAlerts.length} active alert{activeAlerts.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-1">
            {activeAlerts.map((a) => (
              <li key={a.id} className="text-xs text-foreground">
                <span className="font-semibold">{a.label}:</span> {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="glass rounded-card p-3"><p className="text-[10px] uppercase text-muted-foreground">Errors (24h)</p><p className="text-2xl font-bold">{stats.errors24h}</p></div>
        <div className="glass rounded-card p-3"><p className="text-[10px] uppercase text-muted-foreground">API p95 avg</p><p className="text-2xl font-bold">{stats.p95}ms</p></div>
        <div className="glass rounded-card p-3"><p className="text-[10px] uppercase text-muted-foreground">FCP avg</p><p className="text-2xl font-bold">{stats.fcp}ms</p></div>
        <div className="glass rounded-card p-3"><p className="text-[10px] uppercase text-muted-foreground">LCP avg</p><p className="text-2xl font-bold">{stats.lcp}ms</p></div>
      </div>

      <div className="glass rounded-card p-3 mb-4">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" /> SLO Targets
        </p>
        <div className="space-y-1.5">
          {SLOS.map((slo) => {
            const actual = sloActuals[slo.id];
            const status = evaluateSlo(slo, actual ?? null);
            const style = STATUS_STYLES[status];
            const fmt = (v: number | null | undefined) =>
              v == null ? "—" : slo.unit === "ms" ? `${Math.round(v)}ms` : `${v.toFixed(1)}%`;
            return (
              <div key={slo.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${style.className}`}>
                  {style.label}
                </span>
                <span className="text-foreground flex-1 truncate">
                  <span className="font-semibold">{slo.flow}</span> · {slo.sli}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {fmt(actual)} / {slo.comparator === "lt" ? "≤" : "≥"} {fmt(slo.target)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mb-3 text-xs">
        <button onClick={() => setTab("errors")} className={`px-3 py-1.5 rounded-full ${tab === "errors" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          <AlertTriangle className="inline w-3 h-3 mr-1" /> Errors ({errors.length})
        </button>
        <button onClick={() => setTab("perf")} className={`px-3 py-1.5 rounded-full ${tab === "perf" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          <Gauge className="inline w-3 h-3 mr-1" /> Perf ({perf.length})
        </button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading events…</p> : (
        <div className="space-y-2">
          {(tab === "errors" ? errors : perf).slice(0, 100).map((r) => (
            <div key={r.id} className="glass rounded-card p-3 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <span>{r.route ?? "—"}</span>
              </div>
              {tab === "errors" ? (
                <p className="text-foreground mt-1 break-words"><span className="font-bold">[{r.category}]</span> {r.message}</p>
              ) : (
                <p className="text-foreground mt-1">FCP {r.fcp_ms ?? "—"}ms · LCP {r.lcp_ms ?? "—"}ms · TTI {r.tti_ms ?? "—"}ms · p95 {r.api_p95_ms ?? "—"}ms</p>
              )}
            </div>
          ))}
          {(tab === "errors" ? errors : perf).length === 0 && (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
