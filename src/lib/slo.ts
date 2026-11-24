// SLO/SLI targets for HabTastic AI critical user flows.
// SLI = the measured metric; SLO = the target threshold.
// Surfaced in the admin telemetry KPIs dashboard.

export interface SLO {
  id: string;
  flow: string;
  sli: string;
  /** Target threshold (lower-is-better for latency, higher-is-better for success-rate). */
  target: number;
  unit: "ms" | "%";
  /** "lt" => actual must be <= target; "gt" => actual must be >= target. */
  comparator: "lt" | "gt";
  description: string;
}

export const SLOS: SLO[] = [
  {
    id: "onboarding_lcp",
    flow: "Onboarding",
    sli: "LCP (p75)",
    target: 2500,
    unit: "ms",
    comparator: "lt",
    description: "Largest Contentful Paint on first-load onboarding route",
  },
  {
    id: "onboarding_error_rate",
    flow: "Onboarding",
    sli: "Error rate (24h)",
    target: 1,
    unit: "%",
    comparator: "lt",
    description: "Client errors per onboarding session",
  },
  {
    id: "habit_completion_api",
    flow: "Habit completion",
    sli: "API p95",
    target: 600,
    unit: "ms",
    comparator: "lt",
    description: "Toggle-habit round-trip latency at the 95th percentile",
  },
  {
    id: "habit_completion_success",
    flow: "Habit completion",
    sli: "Success rate (24h)",
    target: 99,
    unit: "%",
    comparator: "gt",
    description: "Successful habit completion writes",
  },
  {
    id: "coach_chat_first_token",
    flow: "AI Coach chat",
    sli: "First-token p95",
    target: 3000,
    unit: "ms",
    comparator: "lt",
    description: "Time-to-first-token from Winston AI",
  },
  {
    id: "coach_chat_error_rate",
    flow: "AI Coach chat",
    sli: "Error rate (24h)",
    target: 2,
    unit: "%",
    comparator: "lt",
    description: "Failed coach chat replies",
  },
];

export type SloStatus = "healthy" | "warning" | "breach" | "unknown";

export function evaluateSlo(slo: SLO, actual: number | null | undefined): SloStatus {
  if (actual == null || Number.isNaN(actual)) return "unknown";
  const ratio = slo.comparator === "lt" ? actual / slo.target : slo.target / actual;
  if (slo.comparator === "lt") {
    if (actual <= slo.target) return "healthy";
    if (actual <= slo.target * 1.25) return "warning";
    return "breach";
  }
  // gt
  if (actual >= slo.target) return "healthy";
  if (actual >= slo.target * 0.95) return "warning";
  return "breach";
  void ratio;
}

export const STATUS_STYLES: Record<SloStatus, { label: string; className: string }> = {
  healthy: { label: "Healthy", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  warning: { label: "Warning", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  breach: { label: "Breach", className: "bg-destructive/15 text-destructive border-destructive/30" },
  unknown: { label: "No data", className: "bg-muted text-muted-foreground border-border" },
};

// ---- Alerting thresholds for the telemetry dashboard ----

export interface AlertRule {
  id: string;
  label: string;
  /** Returns a human-readable reason when the rule fires, or null. */
  evaluate: (input: AlertInput) => string | null;
}

export interface AlertInput {
  errors24h: number;
  errors1h: number;
  totalEvents24h: number;
  apiP95Ms: number;
  lcpMs: number;
}

export const ALERT_RULES: AlertRule[] = [
  {
    id: "error_spike",
    label: "Error spike",
    evaluate: ({ errors1h }) =>
      errors1h >= 20 ? `${errors1h} client errors in the last hour (threshold 20)` : null,
  },
  {
    id: "error_rate",
    label: "Elevated error rate",
    evaluate: ({ errors24h, totalEvents24h }) => {
      if (totalEvents24h < 50) return null;
      const rate = (errors24h / totalEvents24h) * 100;
      return rate >= 5 ? `Error rate ${rate.toFixed(1)}% over 24h (threshold 5%)` : null;
    },
  },
  {
    id: "slow_api",
    label: "Slow API",
    evaluate: ({ apiP95Ms }) =>
      apiP95Ms >= 1500 ? `API p95 ${apiP95Ms}ms exceeds 1500ms` : null,
  },
  {
    id: "slow_lcp",
    label: "Slow LCP",
    evaluate: ({ lcpMs }) =>
      lcpMs >= 4000 ? `LCP ${lcpMs}ms exceeds 4000ms` : null,
  },
];
