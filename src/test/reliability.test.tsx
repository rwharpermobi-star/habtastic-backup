/**
 * Reliability tests — verify no path in the app renders blank, that
 * mutation hooks are protected against double-submit, and that the
 * centralized logger captures the failure path.
 *
 * These are intentionally hook-level / component-level tests rather than full
 * e2e: they cover offline mode, slow/timeout responses, corrupted profiles,
 * and double-tap protection deterministically and without flakes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PageShell from "@/components/PageShell";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { getRecentLogs, clearLogs } from "@/lib/logger";

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("reliability: PageShell never blanks", () => {
  beforeEach(() => clearLogs());

  it("renders a loading state instead of blank when loading", () => {
    render(wrap(<PageShell loading><div>kids</div></PageShell>));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders an error state + logs it when error is set (corrupted profile fixture)", () => {
    const corrupted = new Error("profile_corrupt: missing user_id");
    render(wrap(<PageShell error={corrupted} onRetry={() => {}}><div>kids</div></PageShell>));
    expect(screen.getByText(/we hit a snag/i)).toBeInTheDocument();
    expect(screen.getByText(/profile_corrupt/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(getRecentLogs().some(l => l.level === "error")).toBe(true);
  });

  it("renders empty state instead of blank when empty=true", () => {
    render(wrap(<PageShell empty emptyTitle="No habits"><div>kids</div></PageShell>));
    expect(screen.getByText(/no habits/i)).toBeInTheDocument();
  });

  it("renders children when nothing else is set (happy path)", () => {
    render(wrap(<PageShell><div data-testid="kid">hello</div></PageShell>));
    expect(screen.getByTestId("kid")).toBeInTheDocument();
  });
});

describe("reliability: useAsyncAction dedupes & captures failures", () => {
  beforeEach(() => clearLogs());

  it("drops re-entrant calls so a double-tap can't double-submit", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    const work = vi.fn(
      () => new Promise((res) => { resolveFn = res; }),
    );

    function Probe() {
      const { run, loading } = useAsyncAction(work);
      return (
        <button
          data-loading={loading}
          onClick={() => { run(); run(); run(); }}
        >go</button>
      );
    }

    render(wrap(<Probe />));
    const btn = screen.getByRole("button");
    await act(async () => { btn.click(); });
    expect(work).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFn("ok"); });
  });

  it("logs and surfaces errors when the underlying call throws (offline / timeout)", async () => {
    const boom = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    let captured: string | null = null;
    function Probe() {
      const { run, error } = useAsyncAction(boom, { category: "network", label: "test offline" });
      captured = error;
      return <button onClick={() => run().catch(() => {})}>{error ?? "go"}</button>;
    }
    render(wrap(<Probe />));
    await act(async () => { screen.getByRole("button").click(); });
    await waitFor(() => expect(screen.getByRole("button").textContent).toMatch(/failed to fetch/i));
    expect(getRecentLogs().some(l => l.category === "network" && l.level === "error")).toBe(true);
    expect(captured).toMatch(/failed to fetch/i);
  });

  it("simulates a slow response: loading stays true until resolve, then clears", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    const slow = () => new Promise((res) => { resolveFn = res; });
    const states: boolean[] = [];

    function Probe() {
      const { run, loading } = useAsyncAction(slow);
      states.push(loading);
      return <button onClick={() => run()}>{loading ? "..." : "go"}</button>;
    }
    render(wrap(<Probe />));
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByRole("button").textContent).toBe("...");
    await act(async () => { resolveFn("ok"); });
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("go"));
  });
});
