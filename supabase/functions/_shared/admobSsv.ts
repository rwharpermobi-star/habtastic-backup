/**
 * AdMob rewarded-ad Server-Side Verification (SSV).
 *
 * Google calls our callback URL with signed query parameters after a user
 * finishes a rewarded ad. The signature (ECDSA P-256 / SHA-256, DER, web-safe
 * base64) covers everything in the raw query string before `&signature=`.
 * Only parameters inside that signed part are ever trusted.
 * https://developers.google.com/admob/android/ssv
 */

export const ADMOB_VERIFIER_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";

/** Numeric AdMob rewarded ad unit(s) allowed to grant Winston messages. */
export const DEFAULT_REWARDED_AD_UNITS = ["5222407599"];

/** Callbacks older than this are refused (the session itself expires sooner). */
export const MAX_CALLBACK_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SignedQuery {
  message: string;
  signature: string;
  keyId: string;
  params: URLSearchParams;
}

/** Split the raw query into the signed part and its signature/key_id tail. */
export function splitSignedQuery(rawQuery: string): SignedQuery | null {
  const raw = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const idx = raw.indexOf("&signature=");
  if (idx <= 0) return null;
  const message = raw.slice(0, idx);
  const tail = new URLSearchParams(raw.slice(idx + 1));
  const keys = [...tail.keys()];
  // Nothing unsigned may ride along after the signature.
  if (keys.length !== 2 || !keys.includes("signature") || !keys.includes("key_id")) return null;
  const signature = tail.get("signature") ?? "";
  const keyId = tail.get("key_id") ?? "";
  if (!signature || !/^\d+$/.test(keyId)) return null;
  return { message, signature, keyId, params: new URLSearchParams(message) };
}

export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Convert a DER ECDSA signature to the raw r||s form WebCrypto expects. */
export function derToRawSignature(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("bad_der");
  let len = der[i++];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | der[i++];
  }
  if (i + len !== der.length) throw new Error("bad_der");
  const readInt = () => {
    if (der[i++] !== 0x02) throw new Error("bad_der");
    const l = der[i++];
    let v = der.slice(i, i + l);
    i += l;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new Error("bad_der");
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  if (i !== der.length) throw new Error("bad_der");
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

export type VerifierKeys = Map<string, CryptoKey>;

export async function importVerifierKeys(json: unknown): Promise<VerifierKeys> {
  const map: VerifierKeys = new Map();
  const list = (json as { keys?: Array<{ keyId?: number | string; base64?: string }> })?.keys ?? [];
  for (const k of list) {
    if (k?.keyId === undefined || typeof k.base64 !== "string") continue;
    try {
      const der = base64UrlToBytes(k.base64);
      const key = await crypto.subtle.importKey(
        "spki",
        der,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      map.set(String(k.keyId), key);
    } catch {
      /* skip malformed key */
    }
  }
  return map;
}

let cachedKeys: { keys: VerifierKeys; fetchedAt: number } | null = null;
const KEY_CACHE_MS = 12 * 60 * 60 * 1000;

/** Google's public verifier keys, cached; refetched when an unknown key_id appears. */
export async function getVerifierKeys(keyId: string, fetcher: typeof fetch = fetch): Promise<VerifierKeys> {
  const fresh = cachedKeys && Date.now() - cachedKeys.fetchedAt < KEY_CACHE_MS;
  if (fresh && cachedKeys!.keys.has(keyId)) return cachedKeys!.keys;
  const res = await fetcher(ADMOB_VERIFIER_KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`verifier_keys_http_${res.status}`);
  const keys = await importVerifierKeys(await res.json());
  cachedKeys = { keys, fetchedAt: Date.now() };
  return keys;
}

export async function verifySignature(signed: SignedQuery, keys: VerifierKeys): Promise<boolean> {
  const key = keys.get(signed.keyId);
  if (!key) return false;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = derToRawSignature(base64UrlToBytes(signed.signature));
  } catch {
    return false;
  }
  return await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    raw,
    new TextEncoder().encode(signed.message),
  );
}

export type RewardClaim = {
  nonce: string;
  userId: string;
  transactionId: string;
  adUnit: string;
};

export type ClaimResult =
  | { ok: true; claim: RewardClaim }
  | { ok: false; reason: "verification_ping" | "bad_ad_unit" | "bad_params" | "stale" };

/** Validate the (already signature-verified) parameters. */
export function parseRewardClaim(
  params: URLSearchParams,
  allowedAdUnits: string[] = DEFAULT_REWARDED_AD_UNITS,
  now = Date.now(),
): ClaimResult {
  const nonce = params.get("custom_data") ?? "";
  const userId = params.get("user_id") ?? "";
  const transactionId = params.get("transaction_id") ?? "";
  const adUnit = params.get("ad_unit") ?? "";
  const timestamp = Number(params.get("timestamp"));

  // AdMob's "Verify URL" button sends a signed request without our ids.
  if (!nonce && !userId) return { ok: false, reason: "verification_ping" };
  if (!allowedAdUnits.includes(adUnit)) return { ok: false, reason: "bad_ad_unit" };
  if (!UUID_RE.test(nonce) || !UUID_RE.test(userId)) return { ok: false, reason: "bad_params" };
  if (!transactionId || transactionId.length > 200) return { ok: false, reason: "bad_params" };
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "bad_params" };
  if (now - timestamp > MAX_CALLBACK_AGE_MS || timestamp - now > MAX_FUTURE_SKEW_MS) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true, claim: { nonce, userId, transactionId, adUnit } };
}

/** Allowed numeric ad unit ids, overridable with ADMOB_REWARDED_AD_UNITS (comma list). */
export function allowedAdUnitsFromEnv(value: string | undefined): string[] {
  const list = (value ?? "")
    .split(",")
    .map((s) => s.trim().split("/").pop() ?? "")
    .filter((s) => /^\d+$/.test(s));
  return list.length ? list : DEFAULT_REWARDED_AD_UNITS;
}
