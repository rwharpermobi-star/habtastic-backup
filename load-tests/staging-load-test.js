// HabTastic AI — staging-only 1,000 concurrent user load test.
//
// DO NOT POINT AT PRODUCTION. This script is hard-wired with staging
// allowlist checks and a production-host denylist. If the configured URL host
// does not exactly match the allowed staging host, the test aborts before
// sending any traffic.
//
// Required environment variables:
//   LOAD_TEST_BASE_URL           staging web URL
//   LOAD_TEST_SUPABASE_URL       staging Supabase URL
//   LOAD_TEST_ANON_KEY           staging anon/publishable key
//   LOAD_TEST_USER_EMAIL         staging test user email
//   LOAD_TEST_USER_PASSWORD      staging test user password
//   LOAD_TEST_ALLOWED_WEB_HOST   exact expected hostname of LOAD_TEST_BASE_URL
//   LOAD_TEST_ALLOWED_SUPABASE_HOST exact expected hostname of LOAD_TEST_SUPABASE_URL
//
// Optional:
//   LOAD_TEST_HABIT_ID           UUID of a dedicated test habit for completion writes
//   TEST_SIZE                    "smoke" (default) or "full"
//
// Run smoke locally:
//   k6 run -e LOAD_TEST_BASE_URL=... -e LOAD_TEST_SUPABASE_URL=... \
//          -e LOAD_TEST_ANON_KEY=... -e LOAD_TEST_USER_EMAIL=... \
//          -e LOAD_TEST_USER_PASSWORD=... -e LOAD_TEST_ALLOWED_WEB_HOST=... \
//          -e LOAD_TEST_ALLOWED_SUPABASE_HOST=... load-tests/staging-load-test.js
//
// Run full:
//   k6 run -e TEST_SIZE=full ... load-tests/staging-load-test.js

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.LOAD_TEST_BASE_URL;
const SUPABASE_URL = __ENV.LOAD_TEST_SUPABASE_URL;
const ANON_KEY = __ENV.LOAD_TEST_ANON_KEY;
const USER_EMAIL = __ENV.LOAD_TEST_USER_EMAIL;
const USER_PASSWORD = __ENV.LOAD_TEST_USER_PASSWORD;
const ALLOWED_WEB_HOST = (__ENV.LOAD_TEST_ALLOWED_WEB_HOST || "").toLowerCase();
const ALLOWED_SUPABASE_HOST = (__ENV.LOAD_TEST_ALLOWED_SUPABASE_HOST || "").toLowerCase();
const HABIT_ID = __ENV.LOAD_TEST_HABIT_ID;
const TEST_SIZE = (__ENV.TEST_SIZE || "smoke").toLowerCase();

const PRODUCTION_HOSTS = [
  "habtastic.com",
  "www.habtastic.com",
  "habtastic.lovable.app",
  "votldorvfuktonwewuhm.supabase.co",
];

function parseHostname(url) {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function assertRequiredVars() {
  const required = {
    LOAD_TEST_BASE_URL: BASE_URL,
    LOAD_TEST_SUPABASE_URL: SUPABASE_URL,
    LOAD_TEST_ANON_KEY: ANON_KEY,
    LOAD_TEST_USER_EMAIL: USER_EMAIL,
    LOAD_TEST_USER_PASSWORD: USER_PASSWORD,
    LOAD_TEST_ALLOWED_WEB_HOST: ALLOWED_WEB_HOST,
    LOAD_TEST_ALLOWED_SUPABASE_HOST: ALLOWED_SUPABASE_HOST,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing required load-test variables: ${missing.join(", ")}. Refusing to start.`);
  }
}

function assertAllowedHosts() {
  const webHost = parseHostname(BASE_URL);
  const supabaseHost = parseHostname(SUPABASE_URL);

  if (!webHost) throw new Error(`Could not parse hostname from LOAD_TEST_BASE_URL=${BASE_URL}`);
  if (!supabaseHost) throw new Error(`Could not parse hostname from LOAD_TEST_SUPABASE_URL=${SUPABASE_URL}`);

  if (webHost !== ALLOWED_WEB_HOST) {
    throw new Error(
      `LOAD_TEST_BASE_URL host "${webHost}" does not exactly match allowed staging host "${ALLOWED_WEB_HOST}". Refusing to start.`
    );
  }
  if (supabaseHost !== ALLOWED_SUPABASE_HOST) {
    throw new Error(
      `LOAD_TEST_SUPABASE_URL host "${supabaseHost}" does not exactly match allowed staging host "${ALLOWED_SUPABASE_HOST}". Refusing to start.`
    );
  }

  if (PRODUCTION_HOSTS.includes(webHost)) {
    throw new Error(`LOAD_TEST_BASE_URL host "${webHost}" is a known production host. Refusing to start.`);
  }
  if (PRODUCTION_HOSTS.includes(supabaseHost)) {
    throw new Error(`LOAD_TEST_SUPABASE_URL host "${supabaseHost}" is a known production host. Refusing to start.`);
  }
}

// Run guards immediately at module load so k6 exits before any setup request.
assertRequiredVars();
assertAllowedHosts();

export const options = {
  discardResponseBodies: true,
  scenarios: TEST_SIZE === "full"
    ? {
        app_traffic: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "30s", target: 10 },
            { duration: "45s", target: 50 },
            { duration: "60s", target: 200 },
            { duration: "90s", target: 500 },
            { duration: "90s", target: 1000 },
            { duration: "60s", target: 1000 },
            { duration: "45s", target: 200 },
            { duration: "30s", target: 0 },
          ],
          gracefulRampDown: "30s",
          exec: "appTraffic",
        },
      }
    : {
        app_traffic: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "15s", target: 20 },
            { duration: "35s", target: 20 },
            { duration: "10s", target: 0 },
          ],
          gracefulRampDown: "10s",
          exec: "appTraffic",
        },
      },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{expected_response:true}": ["p(95)<2000"],
    rate_limited_429: ["rate<0.10"],
    server_errors_5xx: ["rate<0.01"],
  },
};

const rate429 = new Rate("rate_limited_429");
const rate5xx = new Rate("server_errors_5xx");
const profileLatency = new Trend("flow_profile_ms");
const habitsLatency = new Trend("flow_habits_ms");
const leaderboardLatency = new Trend("flow_leaderboard_ms");
const notificationsLatency = new Trend("flow_notifications_ms");
const telemetryLatency = new Trend("flow_telemetry_ms");
const authUserLatency = new Trend("flow_auth_user_ms");
const shellLatency = new Trend("flow_shell_ms");
const completeHabitLatency = new Trend("flow_complete_habit_ms");

function safeStatus(res) {
  return res && typeof res.status === "number" ? res.status : 0;
}

function track(res) {
  const status = safeStatus(res);
  rate429.add(status === 429);
  rate5xx.add(status >= 500);
  return res;
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
}

function maskToken(token) {
  if (!token || token.length < 8) return "<none>";
  return `len=${token.length} ...${token.slice(-4)}`;
}

export function setup() {
  // Login with email/password to obtain a short-lived access token.
  const loginBody = JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD });
  const loginRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    loginBody,
    { headers: { "Content-Type": "application/json", apikey: ANON_KEY } }
  );

  if (loginRes.status !== 200) {
    let reason = "";
    try {
      const body = JSON.parse(loginRes.body || "{}");
      reason = body.error || body.error_description || body.message || "";
    } catch {
      reason = "non-JSON response";
    }
    throw new Error(
      `Staging login failed: HTTP ${loginRes.status}${reason ? ` — ${reason}` : ""}. Refusing to start load test.`
    );
  }

  let accessToken;
  try {
    const body = JSON.parse(loginRes.body || "{}");
    accessToken = body.access_token;
  } catch {
    throw new Error("Staging login response could not be parsed. Refusing to start load test.");
  }

  if (!accessToken) {
    throw new Error("Staging login succeeded but no access_token returned. Refusing to start load test.");
  }

  console.log(`Staging login OK; token ${maskToken(accessToken)}`);
  return { token: accessToken };
}

const rest = (path) => `${SUPABASE_URL}/rest/v1/${path}`;
const fn = (name) => `${SUPABASE_URL}/functions/v1/${name}`;

export function appTraffic(data) {
  const token = data.token;
  const h = authHeaders(token);

  group("shell", () => {
    const r = track(http.get(BASE_URL, { headers: { Accept: "text/html" } }));
    shellLatency.add(r.timings.duration);
    check(r, { "shell 2xx/3xx": (x) => x.status < 400 });
  });

  group("auth_user", () => {
    const r = track(http.get(`${SUPABASE_URL}/auth/v1/user`, { headers: h }));
    authUserLatency.add(r.timings.duration);
    check(r, { "auth user 200/401/403": (x) => x.status === 200 || x.status === 401 || x.status === 403 });
  });

  group("profile", () => {
    const r = track(
      http.get(rest("profiles?select=id,display_name,coins,gems,xp,level,current_streak,premium_until&limit=1"), {
        headers: h,
      })
    );
    profileLatency.add(r.timings.duration);
    check(r, { "profile 2xx/4xx (not 5xx)": (x) => x.status < 500 });
  });

  group("habits", () => {
    const r = track(
      http.get(rest("habits?select=id,name,emoji,category,frequency,difficulty,custom_days,completions,streak&limit=50"), {
        headers: h,
      })
    );
    habitsLatency.add(r.timings.duration);
    check(r, { "habits 2xx/4xx (not 5xx)": (x) => x.status < 500 });
  });

  group("leaderboard", () => {
    const r = track(http.get(rest("weekly_scores?select=user_id,score&order=score.desc&limit=50"), { headers: h }));
    leaderboardLatency.add(r.timings.duration);
    check(r, { "leaderboard 2xx/4xx (not 5xx)": (x) => x.status < 500 });
  });

  group("notifications", () => {
    const r = track(
      http.get(rest("notifications?select=id,kind,payload,read_at,created_at&order=created_at.desc&limit=25"), {
        headers: h,
      })
    );
    notificationsLatency.add(r.timings.duration);
    check(r, { "notifications 2xx/4xx (not 5xx)": (x) => x.status < 500 });
  });

  group("telemetry", () => {
    const body = JSON.stringify({
      events: [
        {
          kind: "event",
          category: "loadtest",
          message: "k6 staging sample",
          app_version: "loadtest",
          session_id: `k6-${__VU}`,
        },
      ],
    });
    const r = track(http.post(fn("telemetry-ingest"), body, { headers: h }));
    telemetryLatency.add(r.timings.duration);
    check(r, { "telemetry 200/429": (x) => x.status === 200 || x.status === 429 });
  });

  // Low-weight write: complete/uncomplete a dedicated test habit if configured.
  if (HABIT_ID && Math.random() < 0.2) {
    group("complete_habit", () => {
      const today = new Date().toISOString().slice(0, 10);
      const body = JSON.stringify({
        habit_id: HABIT_ID,
        date: today,
        completed: true,
      });
      const r = track(http.post(fn("complete-habit"), body, { headers: h }));
      completeHabitLatency.add(r.timings.duration);
      check(r, { "complete-habit 2xx/4xx (not 5xx)": (x) => x.status < 500 });
    });
  }

  sleep(Math.random() * 3 + 1); // 1-4s think time
}

export function handleSummary(data) {
  const m = data.metrics;
  const getRate = (k) => (m[k] && m[k].values ? m[k].values.rate : 0);
  const getP = (k, p) => {
    const metric = m[k];
    if (!metric || !metric.values) return 0;
    return metric.values[p] !== undefined ? metric.values[p] : 0;
  };

  const vusMax = m.vus_max && m.vus_max.values ? m.vus_max.values.max : 0;
  const reqRate = getRate("http_reqs");
  const iters = m.iterations && m.iterations.values ? m.iterations.values.count : 0;

  const lines = [
    "=== HabTastic staging load test summary ===",
    `Test size:             ${TEST_SIZE}`,
    `Peak VUs:              ${vusMax}`,
    `Completed iterations:  ${iters}`,
    `Requests/sec:          ${(reqRate || 0).toFixed(2)}`,
    `HTTP failure rate:     ${(getRate("http_req_failed") * 100).toFixed(2)}%`,
    `429 rate:              ${(getRate("rate_limited_429") * 100).toFixed(2)}%`,
    `5xx rate:              ${(getRate("server_errors_5xx") * 100).toFixed(2)}%`,
    `Overall p50:           ${getP("http_req_duration", "p(50)").toFixed(0)} ms`,
    `Overall p90:           ${getP("http_req_duration", "p(90)").toFixed(0)} ms`,
    `Overall p95:           ${getP("http_req_duration", "p(95)").toFixed(0)} ms`,
    `Overall p99:           ${getP("http_req_duration", "p(99)").toFixed(0)} ms`,
    "=== Per-flow p95 ===",
    `Profile:               ${getP("flow_profile_ms", "p(95)").toFixed(0)} ms`,
    `Habits:                ${getP("flow_habits_ms", "p(95)").toFixed(0)} ms`,
    `Leaderboard:           ${getP("flow_leaderboard_ms", "p(95)").toFixed(0)} ms`,
    `Notifications:         ${getP("flow_notifications_ms", "p(95)").toFixed(0)} ms`,
    `Telemetry:             ${getP("flow_telemetry_ms", "p(95)").toFixed(0)} ms`,
    `Auth user:             ${getP("flow_auth_user_ms", "p(95)").toFixed(0)} ms`,
    `Shell:                 ${getP("flow_shell_ms", "p(95)").toFixed(0)} ms`,
    HABIT_ID ? `Complete habit:        ${getP("flow_complete_habit_ms", "p(95)").toFixed(0)} ms` : "",
  ];

  const summaryText = lines.join("\n") + "\n";
  return {
    stdout: `\n${summaryText}`,
    "load-tests/last-summary.json": JSON.stringify(data, null, 2),
    "load-tests/summary.txt": summaryText,
  };
}
