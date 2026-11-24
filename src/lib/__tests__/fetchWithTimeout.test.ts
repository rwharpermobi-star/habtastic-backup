import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithTimeout,
  FetchTimeoutError,
  pickTimeoutMs,
  TIMEOUT_LONG_MS,
  TIMEOUT_PAYMENT_MS,
  TIMEOUT_DEFAULT_MS,
  installGlobalFetchTimeout,
  __resetGlobalFetchTimeoutForTests,
} from "@/lib/fetchWithTimeout";

describe("pickTimeoutMs", () => {
  it("uses long timeout for Winston/AI endpoints", () => {
    expect(pickTimeoutMs("https://x/functions/v1/winston-coach-daily")).toBe(TIMEOUT_LONG_MS);
    expect(pickTimeoutMs("https://api.elevenlabs.io/v1/...")).toBe(TIMEOUT_LONG_MS);
  });
  it("uses payment timeout for Paystack/checkout", () => {
    expect(pickTimeoutMs("https://x/functions/v1/paystack-init")).toBe(TIMEOUT_PAYMENT_MS);
    expect(pickTimeoutMs("https://x/checkout/success")).toBe(TIMEOUT_PAYMENT_MS);
  });
  it("uses default timeout for everything else", () => {
    expect(pickTimeoutMs("https://x/rest/v1/habits")).toBe(TIMEOUT_DEFAULT_MS);
  });
});

describe("fetchWithTimeout", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    __resetGlobalFetchTimeoutForTests();
  });

  it("throws FetchTimeoutError when the request exceeds the timeout", async () => {
    globalThis.fetch = vi.fn((_input, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const promise = fetchWithTimeout("https://x/rest/v1/habits", {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);
  });

  it("resolves normally when the request completes in time", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const res = await fetchWithTimeout("https://x/rest/v1/habits", {}, 5_000);
    expect(res.status).toBe(200);
  });

  it("installGlobalFetchTimeout patches window.fetch idempotently", () => {
    globalThis.fetch = vi.fn(async () => new Response("ok")) as unknown as typeof fetch;
    installGlobalFetchTimeout();
    const first = globalThis.fetch;
    installGlobalFetchTimeout();
    expect(globalThis.fetch).toBe(first);
  });
});
