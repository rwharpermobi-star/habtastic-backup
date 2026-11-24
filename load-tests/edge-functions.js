// k6 baseline for critical edge functions.
// Run: k6 run -e SUPABASE_URL=... -e ANON_KEY=... -e USER_JWT=... load-tests/edge-functions.js
//
// Targets reflect the post-9.3 rate limits — load tests should stay BELOW
// the configured caps to validate happy-path throughput without tripping 429s.

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate } from "k6/metrics";

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY     = __ENV.ANON_KEY;
const USER_JWT     = __ENV.USER_JWT || ANON_KEY;

export const options = {
  scenarios: {
    paystack_health: { executor: "constant-arrival-rate", rate: 5, timeUnit: "1s", duration: "30s",
                       preAllocatedVUs: 10, exec: "paystackHealth" },
    ai_coach:        { executor: "constant-arrival-rate", rate: 1, timeUnit: "1s", duration: "1m",
                       preAllocatedVUs: 10, exec: "aiCoach" },
    telemetry:       { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: "30s",
                       preAllocatedVUs: 20, exec: "telemetry" },
  },
  thresholds: {
    "http_req_duration{scenario:paystack_health}": ["p(95)<800"],
    "http_req_duration{scenario:telemetry}":       ["p(95)<400"],
    "http_req_failed":                             ["rate<0.02"],
  },
};

const aiLatency = new Trend("ai_coach_latency");
const aiOk      = new Rate("ai_coach_ok");

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${USER_JWT}`,
    ...extra,
  };
}

export function paystackHealth() {
  const r = http.get(`${SUPABASE_URL}/functions/v1/paystack-health`, { headers: headers() });
  check(r, { "health 200": (x) => x.status === 200 });
  sleep(0.2);
}

export function aiCoach() {
  const r = http.post(
    `${SUPABASE_URL}/functions/v1/ai-coach`,
    JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    { headers: headers(), timeout: "30s" },
  );
  aiLatency.add(r.timings.duration);
  aiOk.add(r.status === 200);
  check(r, { "ai 200 or 429": (x) => x.status === 200 || x.status === 429 });
  sleep(1);
}

export function telemetry() {
  const body = JSON.stringify({
    events: [{ kind: "event", category: "loadtest", message: "k6 sample",
               app_version: "loadtest", session_id: `k6-${__VU}` }],
  });
  const r = http.post(`${SUPABASE_URL}/functions/v1/telemetry-ingest`, body, { headers: headers() });
  check(r, { "telemetry 200": (x) => x.status === 200 });
}
