/**
 * Global fetch timeout wrapper.
 *
 * Wraps `window.fetch` so every network request in the app — Supabase queries,
 * Edge Function invocations, auth calls, external APIs — has a hard ceiling
 * and is safely aborted if it hangs.
 *
 * Timeouts are chosen per-URL:
 *  - Winston AI / voice / streaming coach endpoints: 45s
 *  - Paystack / payments / checkout: 30s
 *  - Everything else (DB, auth, storage, external): 15s
 *
 * Requests that supply their own `AbortSignal` are respected — we chain their
 * signal into our internal one so external cancellation still works. Requests
 * that supply their own `signal` AND clearly opt out (via `x-no-timeout` header)
 * skip the timeout entirely (used for long-lived SSE / EventSource-like fetches).
 *
 * On timeout we:
 *  - Abort the underlying request (no wasted bandwidth / duplicate writes)
 *  - Throw a `FetchTimeoutError` that callers can catch and surface as toast
 *  - Log via the central logger (never leaks to console spam in prod)
 */
import { logError, logWarn } from "@/lib/logger";

export class FetchTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;
  readonly isTimeout = true as const;
  constructor(url: string, timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = "FetchTimeoutError";
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

export const TIMEOUT_LONG_MS = 45_000;    // Winston AI, voice, streaming
export const TIMEOUT_PAYMENT_MS = 30_000; // Paystack / checkout
export const TIMEOUT_DEFAULT_MS = 15_000; // Everything else

/** Pick a timeout based on URL heuristics. Exported for tests. */
export function pickTimeoutMs(url: string): number {
  const u = url.toLowerCase();
  // Winston AI + voice + AI gateway endpoints get the long timeout.
  if (
    u.includes("winston") ||
    u.includes("/ai-") ||
    u.includes("elevenlabs") ||
    u.includes("openai") ||
    u.includes("/coach") ||
    u.includes("voice") ||
    u.includes("generate-avatar") ||
    u.includes("generate-bg-music") ||
    u.includes("journal-analyze") ||
    u.includes("weekly-ai-review") ||
    u.includes("translate-batch")
  ) {
    return TIMEOUT_LONG_MS;
  }
  // Payment flows — Paystack sometimes takes >10s to init.
  if (
    u.includes("paystack") ||
    u.includes("checkout") ||
    u.includes("/shop-") ||
    u.includes("subscription")
  ) {
    return TIMEOUT_PAYMENT_MS;
  }
  return TIMEOUT_DEFAULT_MS;
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Timeout-aware fetch. Prefer using this directly for one-off calls; the
 * `installGlobalFetchTimeout()` installer wraps `window.fetch` for the rest.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  overrideTimeoutMs?: number,
): Promise<Response> {
  const url = extractUrl(input);

  // Explicit opt-out for streams / SSE that must stay open.
  const headers = new Headers(init.headers ?? undefined);
  if (headers.get("x-no-timeout") === "1") {
    headers.delete("x-no-timeout");
    return (installed ? baseFetch : globalThis.fetch.bind(globalThis))(input, { ...init, headers });
  }

  const timeoutMs = overrideTimeoutMs ?? pickTimeoutMs(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Chain any caller-provided signal.
  const external = init.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const runFetch: typeof fetch = installed
    ? baseFetch
    : (globalThis.fetch?.bind(globalThis) as typeof fetch);

  try {
    return await runFetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    // If the caller aborted, propagate their abort as-is.
    if (external?.aborted) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      logWarn("network", "fetch timed out", { url, timeoutMs });
      throw new FetchTimeoutError(url, timeoutMs);
    }
    // Log real network errors quietly; callers still see the throw.
    logError("network", "fetch failed", e, { url });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Hold the original fetch so we can call through without recursion.
let baseFetch: typeof fetch =
  typeof globalThis !== "undefined" && typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : (async () => {
        throw new Error("fetch is not available in this environment");
      }) as typeof fetch;

let installed = false;

/**
 * Patches `window.fetch` (and `globalThis.fetch`) so every network call in the
 * app inherits timeout behavior. Safe to call multiple times — a no-op after
 * the first install.
 */
export function installGlobalFetchTimeout() {
  if (installed) return;
  if (typeof globalThis === "undefined" || typeof globalThis.fetch !== "function") return;
  baseFetch = globalThis.fetch.bind(globalThis);
  installed = true;
  const wrapped: typeof fetch = (input, init) => fetchWithTimeout(input, init ?? {});
  globalThis.fetch = wrapped;
  if (typeof window !== "undefined") window.fetch = wrapped;
}

/** Test-only: restore the pre-install fetch. */
export function __resetGlobalFetchTimeoutForTests() {
  if (!installed) return;
  installed = false;
  if (typeof window !== "undefined") window.fetch = baseFetch;
  globalThis.fetch = baseFetch;
}
