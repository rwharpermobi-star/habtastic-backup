import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Private telemetry ingestion is authenticated-only. Signed-out clients must
// never submit events; signed-in clients must send their real user JWT.

let session: { access_token: string } | null = null;

vi.mock("@/integrations/supabase/lazyClient", () => ({
  getSupabase: async () => ({
    auth: { getSession: async () => ({ data: { session } }) },
  }),
}));

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }));

describe("telemetry sink auth header", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", { visibilityState: "visible" } as unknown as Document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const headersOf = () => new Headers(fetchMock.mock.calls[0]?.[1]?.headers);

  it("does not submit telemetry when signed out", async () => {
    session = null;
    const { trackEvent, flushTelemetry } = await import("@/lib/telemetrySink");
    trackEvent("test", "hello");
    await flushTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Authorization when a real session exists", async () => {
    session = { access_token: "aaa.bbb.ccc" };
    const { trackEvent, flushTelemetry } = await import("@/lib/telemetrySink");
    trackEvent("test", "hello");
    await flushTelemetry();
    expect(headersOf().get("authorization")).toBe("Bearer aaa.bbb.ccc");
  });
});
