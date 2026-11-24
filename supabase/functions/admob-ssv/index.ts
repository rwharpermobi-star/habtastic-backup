/**
 * AdMob rewarded-ad SSV callback (called by Google, not the app).
 *
 * Grants extra Winston messages only after Google's ECDSA signature is
 * verified, the ad unit is ours, and the one-time session (custom_data)
 * belongs to the signed user_id. The DB function is idempotent per
 * transaction_id, so Google retries never double-grant.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  allowedAdUnitsFromEnv,
  getVerifierKeys,
  parseRewardClaim,
  splitSignedQuery,
  verifySignature,
} from "../_shared/admobSsv.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const signed = splitSignedQuery(url.search);
  if (!signed) {
    console.error("admob-ssv: 400 missing or malformed signature/key_id");
    return json({ error: "bad_request" }, 400);
  }

  let valid = false;
  try {
    const keys = await getVerifierKeys(signed.keyId);
    valid = await verifySignature(signed, keys);
  } catch (err) {
    // Non-200 makes Google retry later.
    console.error("admob-ssv: 503 could not load Google verifier keys", String(err));
    return json({ error: "verifier_unavailable" }, 503);
  }
  if (!valid) {
    console.error(`admob-ssv: 403 invalid signature (key_id=${signed.keyId})`);
    return json({ error: "invalid_signature" }, 403);
  }

  const parsed = parseRewardClaim(signed.params, allowedAdUnitsFromEnv(Deno.env.get("ADMOB_REWARDED_AD_UNITS")));
  if (!parsed.ok) {
    // Signed by Google but not grantable — acknowledge so Google stops retrying.
    console.warn(`admob-ssv: ignored (${parsed.reason}) ad_unit=${signed.params.get("ad_unit") ?? ""}`);
    return json({ ok: true, granted: false, reason: parsed.reason });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { claim } = parsed;
  const { data, error } = await admin.rpc("grant_winston_ad_reward", {
    _nonce: claim.nonce,
    _user_id: claim.userId,
    _transaction_id: claim.transactionId,
    _ad_unit: claim.adUnit,
  });
  if (error) {
    console.error("admob-ssv: 500 grant_winston_ad_reward failed", error.message);
    return json({ error: "grant_failed" }, 500);
  }

  const result = (data ?? {}) as { granted?: boolean; reason?: string };
  console.log(
    `admob-ssv: ${result.granted ? "granted" : "not granted"} user=${claim.userId} reason=${result.reason ?? "ok"}`,
  );
  return json({ ok: true, granted: !!result.granted, reason: result.reason ?? null });
});
