// Lightweight performance monitor. Captures Web Vitals (FCP/LCP), a TTI proxy
// (first long idle period after FCP), API/resource latencies, and the largest
// JS bundle chunks. Results are mirrored to localStorage so the debug page
// can render the most recent session even after navigation.
//
// In production this only runs when the user opts in via
// `localStorage.setItem('habtastic:perf', '1')` to keep overhead at zero for
// normal users. Dev builds always enable it.

const KEY = 'habtastic:perf:snapshot:v1';
const MAX_API = 60;

export interface ApiSample {
  url: string;
  status: number;
  duration: number; // ms
  size: number;     // transferSize bytes
  at: number;       // epoch ms
}

export interface ScriptSample {
  url: string;
  transferSize: number;
  duration: number;
}

export interface PerfSnapshot {
  fcp: number | null;
  lcp: number | null;
  tti: number | null;
  api: ApiSample[];
  scripts: ScriptSample[];
  startedAt: number;
  updatedAt: number;
}

let snapshot: PerfSnapshot = emptySnapshot();
let started = false;

function emptySnapshot(): PerfSnapshot {
  return {
    fcp: null, lcp: null, tti: null,
    api: [], scripts: [],
    startedAt: Date.now(), updatedAt: Date.now(),
  };
}

function persist() {
  snapshot.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* noop */ }
}

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;
  try { return localStorage.getItem('habtastic:perf') === '1'; } catch { return false; }
}

export function startPerfMonitor() {
  if (started || !isEnabled() || typeof PerformanceObserver === 'undefined') return;
  started = true;

  // A navigation is a new measurement session. Reusing the previous snapshot
  // mixed old Web Vitals with new API timings and produced impossible multi-
  // hour LCP values in production telemetry.
  snapshot = emptySnapshot();
  persist();

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEntry[]) {
        if (e.name === 'first-contentful-paint') {
          snapshot.fcp = Math.round(e.startTime);
          persist();
        }
      }
    }).observe({ type: 'paint', buffered: true });
  } catch { /* noop */ }

  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) { snapshot.lcp = Math.round(last.startTime); persist(); }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    // LCP is final when the page is backgrounded. Disconnect so late SPA
    // content cannot turn time spent in an open tab into a bogus load metric.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') lcpObserver.disconnect();
    }, { once: true });
  } catch { /* noop */ }

  // TTI proxy: time of first 5s idle window with no long tasks after FCP.
  let lastLongTask = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) lastLongTask = e.startTime + (e).duration;
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* noop */ }

  const ttiTimer = setInterval(() => {
    if (snapshot.tti != null) { clearInterval(ttiTimer); return; }
    const fcp = snapshot.fcp ?? 0;
    if (!fcp) return;
    const now = performance.now();
    if (now - Math.max(fcp, lastLongTask) >= 5000) {
      snapshot.tti = Math.round(Math.max(fcp, lastLongTask));
      persist();
      clearInterval(ttiTimer);
    }
  }, 1000);

  // Resource timing → API samples + largest scripts.
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        const url = e.name;
        if (e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest') {
          snapshot.api.push({
            url: url.replace(/^https?:\/\/[^/]+/, ''),
            status: 0, // status not exposed without server timing; left as 0
            duration: Math.round(e.duration),
            size: e.transferSize || 0,
            at: Date.now(),
          });
          if (snapshot.api.length > MAX_API) snapshot.api = snapshot.api.slice(-MAX_API);
        }
        if (e.initiatorType === 'script' && e.transferSize > 0) {
          // Dedupe by URL keeping the largest record.
          const existing = snapshot.scripts.find((s) => s.url === url);
          if (!existing || existing.transferSize < e.transferSize) {
            const next = { url, transferSize: e.transferSize, duration: Math.round(e.duration) };
            snapshot.scripts = [...snapshot.scripts.filter((s) => s.url !== url), next]
              .sort((a, b) => b.transferSize - a.transferSize)
              .slice(0, 20);
          }
        }
      }
      persist();
    }).observe({ type: 'resource', buffered: true });
  } catch { /* noop */ }
}

export function getPerfSnapshot(): PerfSnapshot {
  // Always re-read storage so the debug page sees writes from other tabs/routes.
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...snapshot, ...(JSON.parse(raw) as PerfSnapshot) };
  } catch { /* noop */ }
  return snapshot;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function enablePerfMonitor(on: boolean) {
  try {
    if (on) localStorage.setItem('habtastic:perf', '1');
    else localStorage.removeItem('habtastic:perf');
  } catch { /* noop */ }
}

export function isPerfMonitorEnabled() {
  return isEnabled();
}
