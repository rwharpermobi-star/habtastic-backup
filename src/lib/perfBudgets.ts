// Runtime performance budgets. These mirror the static bundle budgets in
// `.size-limit.json` but on the client side, so real-user metrics that
// exceed the threshold surface in the admin telemetry dashboard and the
// in-app /dev-perf panel.

import type { PerfSnapshot } from "@/lib/perfMonitor";
import { percentile } from "@/lib/perfMonitor";

export interface PerfBudget {
  key: "fcp" | "lcp" | "tti" | "api_p95" | "largest_script";
  label: string;
  limitMs?: number;
  limitBytes?: number;
}

export const PERF_BUDGETS: PerfBudget[] = [
  { key: "fcp", label: "First Contentful Paint", limitMs: 1800 },
  { key: "lcp", label: "Largest Contentful Paint", limitMs: 2500 },
  { key: "tti", label: "TTI proxy", limitMs: 3500 },
  { key: "api_p95", label: "API p95", limitMs: 800 },
  { key: "largest_script", label: "Largest JS chunk (transfer)", limitBytes: 200 * 1024 },
];

export interface BudgetResult {
  budget: PerfBudget;
  value: number | null;
  passing: boolean;
}

export function evaluateBudgets(snap: PerfSnapshot): BudgetResult[] {
  const apiP95 = percentile(snap.api.map((a) => a.duration), 95);
  const largestScript = snap.scripts.reduce((m, s) => Math.max(m, s.transferSize), 0);

  const valueFor = (b: PerfBudget): number | null => {
    switch (b.key) {
      case "fcp": return snap.fcp;
      case "lcp": return snap.lcp;
      case "tti": return snap.tti;
      case "api_p95": return apiP95 || null;
      case "largest_script": return largestScript || null;
    }
  };

  return PERF_BUDGETS.map((budget) => {
    const value = valueFor(budget);
    const limit = budget.limitMs ?? budget.limitBytes ?? Infinity;
    const passing = value == null ? true : value <= limit;
    return { budget, value, passing };
  });
}

export function formatBudgetValue(b: BudgetResult): string {
  if (b.value == null) return "—";
  if (b.budget.limitBytes) return `${(b.value / 1024).toFixed(1)} kB`;
  return b.value >= 1000 ? `${(b.value / 1000).toFixed(2)}s` : `${Math.round(b.value)}ms`;
}

export function formatBudgetLimit(b: BudgetResult): string {
  if (b.budget.limitBytes) return `${(b.budget.limitBytes / 1024).toFixed(0)} kB`;
  if (b.budget.limitMs != null) {
    return b.budget.limitMs >= 1000 ? `${(b.budget.limitMs / 1000).toFixed(1)}s` : `${b.budget.limitMs}ms`;
  }
  return "—";
}
