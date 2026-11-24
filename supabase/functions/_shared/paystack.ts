// Shared Paystack helpers (Deno / Edge Functions)
import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_API = "https://api.paystack.co";
const PAYSTACK_REQUEST_TIMEOUT_MS = 8_000;

export function getSecretKey(): string {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

/**
 * Secret rotation support. During a rotation window the Paystack dashboard may
 * still be signing with the old key (or already with the new one, before we
 * finish rolling it out here). Both are accepted for signature verification
 * only — outbound API calls always use the current key.
 *
 * Set PAYSTACK_SECRET_KEY_PREVIOUS to the outgoing key for the transition and
 * delete it once the dashboard is confirmed on the new key.
 */
export function getVerificationKeys(): { key: string; label: "current" | "previous" }[] {
  const keys: { key: string; label: "current" | "previous" }[] = [
    { key: getSecretKey(), label: "current" },
  ];
  const prev = Deno.env.get("PAYSTACK_SECRET_KEY_PREVIOUS");
  if (prev && prev !== keys[0].key) keys.push({ key: prev, label: "previous" });
  return keys;
}

export function getEnvironment(): "test" | "live" {
  return getSecretKey().startsWith("sk_live_") ? "live" : "test";
}

/**
 * Validate a caller-supplied callback URL. Paystack redirects the user's
 * browser to this URL after payment, so an unchecked value is an open-redirect
 * / XSS vector (e.g. `javascript:...`). We enforce:
 *  - Absolute https:// URL (no javascript:, data:, http:, relative)
 *  - Host on an allowlist: habtastic.com (+subdomains), lovable.app previews,
 *    or PAYSTACK_ALLOWED_CALLBACK_HOSTS (comma-separated) for custom domains.
 *  - Localhost only in test mode.
 */
export function isAllowedCallbackUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(getEnvironment() === "test" && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))) return false;
  const host = u.hostname.toLowerCase();
  const extra = (Deno.env.get("PAYSTACK_ALLOWED_CALLBACK_HOSTS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set<string>([
    "habtastic.com",
    "www.habtastic.com",
    ...extra,
  ]);
  if (allowed.has(host)) return true;
  // Lovable preview + custom-preview subdomains
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return true;
  if (getEnvironment() === "test" && (host === "localhost" || host === "127.0.0.1")) return true;
  return false;
}

export async function paystack<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const timeoutController = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => timeoutController.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => timeoutController.abort(), PAYSTACK_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${PAYSTACK_API}${path}`, {
      ...init,
      signal: timeoutController.signal,
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (json && json.status === false)) {
      throw new Error(
        `Paystack ${path} failed: ${res.status} ${JSON.stringify(json)}`,
      );
    }
    return json as T;
  } catch (error) {
    if (timeoutController.signal.aborted && !callerSignal?.aborted) {
      throw new Error(`Paystack request timed out after ${PAYSTACK_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * Verify the `x-paystack-signature` header (HMAC-SHA512 of the raw body keyed
 * with the Paystack secret key). Uses a constant-time comparison so a
 * malicious sender cannot recover the expected digest byte-by-byte from
 * response timing.
 *
 * Accepts the current key and, during a rotation window, the previous key.
 * Returns which key matched so the webhook can log rotation progress.
 */
export function verifySignatureDetailed(
  rawBody: string,
  signature: string | null,
): { valid: boolean; keyUsed: "current" | "previous" | null } {
  if (!signature || typeof signature !== "string") return { valid: false, keyUsed: null };
  const provided = new TextEncoder().encode(signature.toLowerCase());
  for (const { key, label } of getVerificationKeys()) {
    const expected = createHmac("sha512", key).update(rawBody).digest("hex");
    if (signature.length !== expected.length) continue;
    try {
      if (timingSafeEqual(provided, new TextEncoder().encode(expected))) {
        return { valid: true, keyUsed: label };
      }
    } catch {
      // fall through to the next candidate key
    }
  }
  return { valid: false, keyUsed: null };
}

export function verifySignature(rawBody: string, signature: string | null): boolean {
  return verifySignatureDetailed(rawBody, signature).valid;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Plan catalog. Codes are created on-demand inside paystack-init if missing.
// Amounts are in **kobo / cents** (smallest currency unit). ZAR: 1 ZAR = 100.
//
// Currency defaults to ZAR (HabTastic is priced in Rand). Override per env via
// PAYSTACK_CURRENCY if ever needed. Supported by Paystack: USD, NGN, GHS, ZAR, KES.
export const CURRENCY = (Deno.env.get("PAYSTACK_CURRENCY") || "ZAR").toUpperCase();

// Public-facing webhook URL. Optional — only used so debug / health pages can
// report the URL the dashboard should be configured with.
export const WEBHOOK_URL =
  Deno.env.get("PAYSTACK_WEBHOOK_URL") ||
  `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/paystack-webhook`;

// Subscription + one-time plans. Names include a version suffix so a pricing
// migration won't collide with previously-created Paystack plan objects.
export const PLANS = {
  monthly: {
    name: `HabTastic Premium Monthly v5 (${CURRENCY})`,
    interval: "monthly" as const,
    amount: 9499, // R94.99
    currency: CURRENCY,
    oneTime: false as const,
  },
  yearly: {
    name: `HabTastic Premium Yearly v9 (${CURRENCY})`,
    interval: "annually" as const,
    amount: 89999, // R899.99
    currency: CURRENCY,
    oneTime: false as const,
  },
};
export type PlanKey = keyof typeof PLANS;

export function isConfiguredPaystackPlan(plan: { name?: unknown; interval?: unknown; currency?: unknown }, key: PlanKey): boolean {
  const cfg = PLANS[key];
  return (
    plan?.name === cfg.name &&
    plan?.interval === cfg.interval &&
    String(plan?.currency ?? "").toUpperCase() === cfg.currency
  );
}

export async function listPaystackPlans(): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const list = await paystack<any>(`/plan?perPage=100&page=${page}`, { method: "GET" });
    const items: any[] = list?.data ?? [];
    all.push(...items);
    const meta = list?.meta;
    if (!items.length || (meta?.page && meta?.page >= meta?.pageCount)) break;
    if (!meta?.pageCount && items.length < 100) break;
  }
  return all;
}
