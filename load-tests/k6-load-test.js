// HabTastic AI — 1,000 concurrent user load test.
//
// RUN THIS LOCALLY, NOT FROM CI: it drives real traffic at the production
// Supabase project and will trip the per-IP rate limits on the public edge
// functions if you point it at prod without care. Prefer a staging project.
//
//   k6 run \
//     -e SUPABASE_URL=https://<ref>.supabase.co \
//     -e ANON_KEY=<publishable key> \
//     -e USER_JWT=<a test user access token> \
//     -e VUS=1000 -e DURATION=5m \
//     load-tests/k6-load-test.js
//
// What it exercises (read-mostly, no destructive writes):
//   - auth token refresh          (auth/v1/user)
//   - habits + profile reads      (rest/v1, RLS-filtered)
//   - leaderboard read            (rest/v1 view)
//   - referral + notification prefs reads
//   - telemetry ingest write      (rate-limited edge function)
//   - paystack-config read        (cached edge function)
//   - Winston AI                  (low rate — expensive, model-bound)
//
// Saturation is reported per-group via the http_req_duration sub-metrics plus
// the `saturation_429` / `saturation_5xx` rates, so you can see exactly which
// dependency gives out first.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.ANON_KEY;
const USER_JWT = __ENV.USER_JWT || ANON_KEY;
const VUS = Number(__ENV.VUS || 1000);
const DURATION = __ENV.DURATION || "5m";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("SUPABASE_URL and ANON_KEY are required (-e SUPABASE_URL=... -e ANON_KEY=...)");
}

export const options = {
  discardResponseBodies: false,
  scenarios: {
    // Ramp to the full 1,000 VUs so you can watch where latency knees.
    app_traffic: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: "1m", target: 250 },
        { duration: "1m", target: 500 },
        { duration: "1m", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "30s", target: 0 },
      ],
      exec: "appTraffic",
      gracefulRampDown: "30s",
    },
    // Winston is model-bound; keep it at a realistic trickle.
    winston_ai: {
      executor: "constant-arrival-rate",
      rate: 2,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 60,
      exec: "winstonAi",
    },
  },
  thresholds: {
    "http_req_failed": ["rate<0.02"],
    "http_req_duration{group:::db_reads}": ["p(95)<800"],
    "http_req_duration{group:::leaderboard}": ["p(95)<1000"],
    "http_req_duration{group:::telemetry}": ["p(95)<600"],
    "http_req_duration{group:::paystack_config}": ["p(95)<1200"],
    "saturation_429": ["rate<0.05"],
    "saturation_5xx": ["rate<0.01"],
  },
};

const rate429 = new Rate("saturation_429");
const rate5xx = new Rate("saturation_5xx");
const dbLatency = new Trend("db_read_latency");
const aiLatency = new Trend("winston_latency");

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${USER_JWT}`,
    ...extra,
  };
}

function track(res) {
  rate429.add(res.status === 429);
  rate5xx.add(res.status >= 500);
  return res;
}

const rest = (path) => `${SUPABASE_URL}/rest/v1/${path}`;
const fn = (name) => `${SUPABASE_URL}/functions/v1/${name}`;

export function appTraffic() {
  group("auth", () => {
    const r = track(http.get(`${SUPABASE_URL}/auth/v1/user`, { headers: headers() }));
    check(r, { "auth 200/401": (x) => x.status === 200 || x.status === 401 });
  });

  group("db_reads", () => {
    const batch = track(
      http.batch([
        ["GET", rest("habits?select=id,name,streak&limit=50"), null, { headers: headers() }],
        ["GET", rest("profiles?select=id,coins,gems,xp,premium_until&limit=1"), null, { headers: headers() }],
        ["GET", rest("notification_prefs?select=*&limit=1"), null, { headers: headers() }],
        ["GET", rest("referrals?select=id,status&limit=20"), null, { headers: headers() }],
      ])[0],
    );
    dbLatency.add(batch.timings.duration);
    check(batch, { "rest 2xx/4xx (not 5xx)": (x) => x.status < 500 });
  });

  group("leaderboard", () => {
    const r = track(http.get(rest("weekly_scores?select=*&order=score.desc&limit=50"), { headers: headers() }));
    check(r, { "leaderboard not 5xx": (x) => x.status < 500 });
  });

  group("telemetry", () => {
    const body = JSON.stringify({
      events: [
        {
          kind: "event",
          category: "loadtest",
          message: "k6 1k-user sample",
          app_version: "loadtest",
          session_id: `k6-${__VU}`,
        },
      ],
    });
    const r = track(http.post(fn("telemetry-ingest"), body, { headers: headers() }));
    check(r, { "telemetry 200/429": (x) => x.status === 200 || x.status === 429 });
  });

  group("paystack_config", () => {
    const r = track(
      http.post(fn("paystack-config"), JSON.stringify({ pricing_version: "loadtest" }), { headers: headers() }),
    );
    check(r, { "config 200": (x) => x.status === 200 });
  });

  sleep(Math.random() * 3 + 1); // 1-4s think time
}

export function winstonAi() {
  const r = track(
    http.post(fn("ai-coach"), JSON.stringify({ messages: [{ role: "user", content: "one line pep talk" }] }), {
      headers: headers(),
      timeout: "45s",
    }),
  );
  aiLatency.add(r.timings.duration);
  check(r, { "ai 200/429": (x) => x.status === 200 || x.status === 429 });
}

export function handleSummary(data) {
  const m = data.metrics;
  const get = (k, s = "p(95)") => (m[k] && m[k].values ? m[k].values[s] : undefined);
  const lines = [
    "=== HabTastic load test summary ===",
    `VUs (peak):            ${VUS}`,
    `http_req_failed:       ${((get("http_req_failed", "rate") || 0) * 100).toFixed(2)}%`,
    `429 rate (rate limit): ${((get("saturation_429", "rate") || 0) * 100).toFixed(2)}%`,
    `5xx rate:              ${((get("saturation_5xx", "rate") || 0) * 100).toFixed(2)}%`,
    `DB read p95:           ${(get("db_read_latency") || 0).toFixed(0)} ms`,
    `Winston p95:           ${(get("winston_latency") || 0).toFixed(0)} ms`,
    `Overall req p95:       ${(get("http_req_duration") || 0).toFixed(0)} ms`,
  ].join("\n");
  return { stdout: `\n${lines}\n`, "load-tests/last-summary.json": JSON.stringify(data, null, 2) };
}
