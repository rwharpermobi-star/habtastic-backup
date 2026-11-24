// Forwards client logger + perf snapshots to the `telemetry-ingest` edge
// function. Batches in-memory, flushes on interval + page hide, and falls
// back to `sendBeacon` so events survive tab close.

import { attachLogSink, type LogEvent } from "@/lib/logger";
import { getPerfSnapshot, percentile } from "@/lib/perfMonitor";
import { evaluateBudgets } from "@/lib/perfBudgets";
import { getSupabase } from '@/integrations/supabase/lazyClient';
import { activeBackend } from '@/integrations/supabase/backendConfig';
import { isUsageAnalyticsEnabled } from '@/lib/privacyPreferences';

const FLUSH_INTERVAL_MS = 15_000;
const MAX_QUEUE = 50;
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || "dev";
const SESSION_ID = (() => {
  try {
    const k = "habtastic:telemetry-session";
    let v = sessionStorage.getItem(k);
    if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(k, v); }
    return v;
  } catch { return crypto.randomUUID(); }
})();

interface OutEvent {
  kind: "error" | "perf" | "event";
  category?: string;
  level?: string;
  message?: string;
  route?: string;
  app_version: string;
  session_id: string;
  context?: Record<string, unknown>;
  fcp_ms?: number | null;
  lcp_ms?: number | null;
  tti_ms?: number | null;
  api_p95_ms?: number | null;
}

let queue: OutEvent[] = [];
let started = false;
const reportedBreaches = new Set<string>();

// ---- PII scrubbing -------------------------------------------------------
// Telemetry messages, stack traces, and routes can accidentally carry
// emails, JWTs, OAuth codes, or reset tokens (e.g. `#access_token=...` on
// password-reset redirects). Strip them before they leave the client.
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/(access_token|refresh_token|id_token|token|code|otp|api[_-]?key)=([^&\s"']+)/gi, "$1=[redacted]"],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]"],
];
const MAX_MSG = 2000;

function scrubString(v: string): string {
  let out = v;
  for (const [re, sub] of PII_PATTERNS) out = out.replace(re, sub);
  if (out.length > MAX_MSG) out = out.slice(0, MAX_MSG) + "…[truncated]";
  return out;
}
function scrubRoute(r?: string): string | undefined {
  if (!r) return r;
  // Drop querystring and hash entirely — high-PII surface, low debug value.
  return r.split("?")[0].split("#")[0];
}
function scrubContext(c?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!c) return c;
  try {
    const json = JSON.stringify(c);
    return JSON.parse(scrubString(json));
  } catch {
    return undefined;
  }
}

function endpoint(): string {
  return `${activeBackend.url}/functions/v1/telemetry-ingest`;
}

export async function flushTelemetry() {
  return flush();
}

async function flush() {
  if (!isUsageAnalyticsEnabled()) {
    queue = [];
    return;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  const payload = JSON.stringify({ events: batch });
  const url = endpoint();
  const apikey = activeBackend.publishableKey;

  // Prefer sendBeacon on pagehide (fire-and-forget, survives unload).
  if (document.visibilityState === "hidden" && "sendBeacon" in navigator) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    } catch { /* fall through to fetch */ }
  }

  try {
    const { data: { session } } = await (await getSupabase()).auth.getSession();
    // Telemetry history is private and authenticated-only. Signed-out events
    // stay local and are discarded rather than allowing anonymous poisoning.
    if (!session?.access_token) return;
    await fetch(url, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "apikey": apikey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: payload,
    });
  } catch {
    // Re-queue at front if transient failure (cap to MAX_QUEUE).
    queue = [...batch, ...queue].slice(0, MAX_QUEUE);
  }
}

function enqueue(ev: OutEvent) {
  if (!isUsageAnalyticsEnabled()) return;
  // Always scrub immediately so anything held in-memory is already safe.
  const safe: OutEvent = {
    ...ev,
    message: ev.message ? scrubString(ev.message) : ev.message,
    route: scrubRoute(ev.route),
    context: scrubContext(ev.context),
  };
  queue.push(safe);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

function logToEvent(e: LogEvent): OutEvent {
  return {
    kind: e.level === "error" ? "error" : "event",
    category: e.category,
    level: e.level,
    message: e.message,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    app_version: APP_VERSION,
    session_id: SESSION_ID,
    context: { ...e.context, stack: e.stack },
  };
}

export function startTelemetrySink() {
  if (started || typeof window === "undefined") return;
  started = true;

  attachLogSink((e) => {
    // Only forward warn + error to keep volume sane.
    if (e.level === "info") return;
    enqueue(logToEvent(e));
  });

  // Periodic perf sample. Skipped while the tab/app is backgrounded — on
  // Android these wakeups cost battery for samples nobody is looking at.
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const snap = getPerfSnapshot();
    if (!snap.fcp && !snap.lcp && snap.api.length === 0) return;
    enqueue({
      kind: "perf",
      app_version: APP_VERSION,
      session_id: SESSION_ID,
      route: window.location.pathname,
      fcp_ms: snap.fcp,
      lcp_ms: snap.lcp,
      tti_ms: snap.tti,
      api_p95_ms: percentile(snap.api.map((a) => a.duration), 95),
    });

    // Budget breach events — reported once per session per budget so the
    // admin dashboard sees a spike when a deploy blows the runtime budget.
    for (const b of evaluateBudgets(snap)) {
      if (b.passing || b.value == null) continue;
      const breachKey = `budget:${b.budget.key}`;
      if (reportedBreaches.has(breachKey)) continue;
      reportedBreaches.add(breachKey);
      enqueue({
        kind: "event",
        category: "perf_budget_breach",
        level: "warn",
        message: `${b.budget.label} over budget`,
        app_version: APP_VERSION,
        session_id: SESSION_ID,
        route: window.location.pathname,
        context: {
          metric: b.budget.key,
          value: b.value,
          limit: b.budget.limitMs ?? b.budget.limitBytes,
        },
      });
    }
  }, 60_000);


  setInterval(() => {
    // A hidden tab has nothing new to report; the pagehide/visibilitychange
    // handlers below already flush whatever was queued before backgrounding.
    if (document.visibilityState !== "visible") return;
    flush();
  }, FLUSH_INTERVAL_MS);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

export function trackEvent(category: string, message: string, context?: Record<string, unknown>) {
  enqueue({
    kind: "event",
    category,
    message,
    app_version: APP_VERSION,
    session_id: SESSION_ID,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    context,
  });
}
