import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  allowedAdUnitsFromEnv,
  derToRawSignature,
  importVerifierKeys,
  parseRewardClaim,
  splitSignedQuery,
  verifySignature,
} from "./admobSsv.ts";

const NONCE = "3f0c2a4e-8d1b-4c6a-9e2f-1a2b3c4d5e6f";
const USER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** raw r||s -> DER, like Google sends. */
function rawToDer(raw: Uint8Array) {
  const int = (v: Uint8Array) => {
    let i = 0;
    while (i < v.length - 1 && v[i] === 0) i++;
    let t = v.slice(i);
    if (t[0] & 0x80) t = new Uint8Array([0, ...t]);
    return new Uint8Array([0x02, t.length, ...t]);
  };
  const r = int(raw.slice(0, 32));
  const s = int(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

async function setup() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const keys = await importVerifierKeys({ keys: [{ keyId: 1234, base64: btoa(String.fromCharCode(...spki)) }] });
  const sign = async (message: string) => {
    const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(message)));
    return b64url(rawToDer(raw));
  };
  return { keys, sign };
}

function message(overrides: Record<string, string> = {}, ts = Date.now()) {
  const p: Record<string, string> = {
    ad_network: "5450213213286189855",
    ad_unit: "5222407599",
    custom_data: NONCE,
    reward_amount: "3",
    reward_item: "messages",
    timestamp: String(ts),
    transaction_id: "tx-abc123",
    user_id: USER,
    ...overrides,
  };
  return Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

Deno.test("a genuinely signed completed view verifies and yields the claim", async () => {
  const { keys, sign } = await setup();
  const msg = message();
  const signed = splitSignedQuery(`${msg}&signature=${await sign(msg)}&key_id=1234`)!;
  assert(await verifySignature(signed, keys));
  const claim = parseRewardClaim(signed.params);
  assertEquals(claim, { ok: true, claim: { nonce: NONCE, userId: USER, transactionId: "tx-abc123", adUnit: "5222407599" } });
});

Deno.test("tampered parameters fail the signature", async () => {
  const { keys, sign } = await setup();
  const msg = message();
  const sig = await sign(msg);
  const forged = msg.replace(USER, "11111111-2222-4333-8444-555555555555");
  assertEquals(await verifySignature(splitSignedQuery(`${forged}&signature=${sig}&key_id=1234`)!, keys), false);
});

Deno.test("unknown key id or garbage signature is refused", async () => {
  const { keys, sign } = await setup();
  const msg = message();
  const sig = await sign(msg);
  assertEquals(await verifySignature(splitSignedQuery(`${msg}&signature=${sig}&key_id=999`)!, keys), false);
  assertEquals(await verifySignature(splitSignedQuery(`${msg}&signature=AAAA&key_id=1234`)!, keys), false);
});

Deno.test("unsigned parameters appended after the signature are rejected", async () => {
  const { sign } = await setup();
  const msg = message();
  const sig = await sign(msg);
  assertEquals(splitSignedQuery(`${msg}&signature=${sig}&key_id=1234&user_id=${USER}`), null);
  assertEquals(splitSignedQuery(msg), null);
});

Deno.test("only the HabTastic rewarded ad unit can grant messages", () => {
  const r = parseRewardClaim(new URLSearchParams(message({ ad_unit: "5224354917" })));
  assertEquals(r, { ok: false, reason: "bad_ad_unit" });
});

Deno.test("AdMob console verification ping is recognised, not granted", () => {
  const r = parseRewardClaim(new URLSearchParams(message({ custom_data: "", user_id: "" })));
  assertEquals(r, { ok: false, reason: "verification_ping" });
});

Deno.test("callbacks older than 2 hours are stale", () => {
  const old = Date.now() - 3 * 60 * 60 * 1000;
  assertEquals(parseRewardClaim(new URLSearchParams(message({}, old))), { ok: false, reason: "stale" });
});

Deno.test("non-uuid custom data is refused", () => {
  assertEquals(parseRewardClaim(new URLSearchParams(message({ custom_data: "give-me-100" }))), { ok: false, reason: "bad_params" });
});

Deno.test("DER signatures with leading zero bytes convert to 64 raw bytes", () => {
  const raw = new Uint8Array(64);
  raw[0] = 0x80; raw[32] = 0x01;
  assertEquals(derToRawSignature(rawToDer(raw)), raw);
});

Deno.test("ad unit allow-list accepts full or numeric ids from env", () => {
  assertEquals(allowedAdUnitsFromEnv("ca-app-pub-1/111, 222"), ["111", "222"]);
  assertEquals(allowedAdUnitsFromEnv(undefined), ["5222407599"]);
});
