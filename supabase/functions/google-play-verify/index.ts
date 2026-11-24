// Verifies a Google Play subscription purchase server-side and records only
// Google-authoritative subscription state.
//
// Security model:
// - Requires an authenticated Supabase user.
// - The client can request verification, but it can never write Premium fields.
// - The purchase token is checked against the Google Play Android Publisher API
//   (purchases.subscriptionsv2), including account binding, product/base plan,
//   subscription state and expiry.
// - This client-callable verifier is READ-ONLY with respect to entitlements.
//   It never writes subscriptions or profile Premium fields.
// - Premium is granted only from the separately authenticated Google Play RTDN
//   webhook after it independently re-verifies the purchase with Google.
// - Fails closed: any missing provider configuration or verification failure
//   produces no entitlement.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { parseServiceAccount } from "../_shared/googleServiceAccount.ts";

const PACKAGE_NAME = "app.lovable.habtastic";

const PLANS: Record<string, { basePlanId: string; interval: string }> = {
  habtastic_premium_monthly: { basePlanId: "monthly", interval: "monthly" },
  habtastic_premium_yearly: { basePlanId: "yearly", interval: "annually" },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

/** Mints a Google OAuth2 access token from the service-account JSON (JWT bearer flow). */
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = parseServiceAccount(serviceAccountJson);

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  ));
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body?.access_token) throw new Error(`google_token_failed:${res.status}`);
  return body.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      console.error("google-play-verify: 401 missing Authorization header");
      return json({ error: "Unauthorized" }, 401);
    }
    const bearer = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    if (!bearer) {
      console.error("google-play-verify: 401 malformed Authorization header (expected \"Bearer <token>\")");
      return json({ error: "Unauthorized" }, 401);
    }
    if (bearer[1].split(".").length !== 3) {
      console.error("google-play-verify: 401 malformed token (not a JWT)");
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userData?.user) {
      console.error("google-play-verify: 401 getUser failed", userError?.status ?? null, userError?.message ?? "no user returned");
      return json({ error: "Unauthorized" }, 401);
    }
    const user = userData.user;
    if (user.role !== "authenticated" || user.is_anonymous) {
      console.error(`google-play-verify: 401 not a signed-in account (role=${user.role ?? "none"}, anonymous=${!!user.is_anonymous})`);
      return json({ error: "Unauthorized" }, 401);
    }

    const rl = await enforceRateLimit(supabase, [
      { action: "google_play_verify_min", windowSeconds: 60, max: 20 },
      { action: "google_play_verify_hour", windowSeconds: 3600, max: 120 },
    ], { name: "google-play-verify", userId: user.id, corsHeaders });
    if (rl) {
      console.error(`google-play-verify: ${rl.status} rate limited user=${user.id}`);
      return rl;
    }

    let payload: any = {};
    try { payload = await req.json(); } catch { /* handled below */ }
    const purchaseToken = typeof payload?.purchaseToken === "string" ? payload.purchaseToken.trim() : "";
    const productId = typeof payload?.productId === "string" ? payload.productId.trim() : "";
    const basePlanId = typeof payload?.basePlanId === "string" ? payload.basePlanId.trim() : "";

    if (!purchaseToken || purchaseToken.length > 4096) {
      console.error(`google-play-verify: 400 invalid purchase token (length ${purchaseToken.length})`);
      return json({ error: "invalid_purchase_token" }, 400);
    }
    const expected = PLANS[productId];
    if (!expected) {
      console.error(`google-play-verify: 400 unknown product "${productId}"`);
      return json({ error: "unknown_product" }, 400);
    }
    if (basePlanId && basePlanId !== expected.basePlanId) {
      console.error(`google-play-verify: 400 base plan mismatch (got "${basePlanId}", expected "${expected.basePlanId}")`);
      return json({ error: "base_plan_mismatch" }, 400);
    }

    const saJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    if (!saJson) {
      console.error("google-play-verify: 503 missing Google service account secret GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
      return json({ error: "verification_unavailable" }, 503);
    }

    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(saJson);
    } catch (e) {
      console.error("google-play-verify: 503 Google access token error", String(e));
      return json({ error: "verification_unavailable" }, 503);
    }

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const gRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const gBody = await gRes.text().catch(() => "");
    let sub: any = null;
    try { sub = gBody ? JSON.parse(gBody) : null; } catch { sub = null; }
    if (!gRes.ok || !sub) {
      console.error(`google-play-verify: ${gRes.status === 404 ? 404 : 400} Google Play API status ${gRes.status} body:`, gBody.slice(0, 2000));
      return json({ error: "purchase_not_found", entitled: false }, gRes.status === 404 ? 404 : 400);
    }

    // Require cryptographic/provider-side account binding before granting anything.
    const accountId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (typeof accountId !== "string" || !accountId || accountId !== user.id) {
      console.error(`google-play-verify: 403 account binding ${accountId ? "mismatch" : "missing"} user=${user.id}`);
      return json({ error: "account_mismatch", entitled: false }, 403);
    }

    // Validate the purchase really belongs to the expected product + base plan.
    const lineItems: any[] = Array.isArray(sub.lineItems) ? sub.lineItems : [];
    const item = lineItems.find((li) =>
      li?.productId === productId &&
      (li?.offerDetails?.basePlanId ?? expected.basePlanId) === expected.basePlanId
    );
    if (!item) {
      console.error(`google-play-verify: 400 product mismatch, no line item for "${productId}"/"${expected.basePlanId}"`);
      return json({ error: "product_mismatch", entitled: false }, 400);
    }

    const state = String(sub.subscriptionState ?? "");
    const status =
      state === "SUBSCRIPTION_STATE_ACTIVE" || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
        ? "active"
        : state === "SUBSCRIPTION_STATE_CANCELED"
          ? "non-renewing"
          : "inactive";
    const entitled = [
      "SUBSCRIPTION_STATE_ACTIVE",
      "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
      "SUBSCRIPTION_STATE_CANCELED",
    ].includes(state);
    const expiryIso: string | null = item.expiryTime ?? null;
    const expiresInFuture = !!expiryIso && new Date(expiryIso).getTime() > Date.now();

    if (!entitled || !expiresInFuture) {
      return json({ verified: true, entitled: false, status: state || "inactive", current_period_end: expiryIso }, 200);
    }

    // Read-only confirmation for the Android client. This function deliberately
    // performs no subscription/profile mutation. The Google Play RTDN webhook is
    // the sole authority that persists provider state and activates Premium.
    return json({
      verified: true,
      entitled: true,
      status,
      plan_interval: expected.interval,
      current_period_end: expiryIso,
      activation: "provider_webhook_pending",
    });
  } catch (e) {
    console.error("google-play-verify: 500 unexpected error", e instanceof Error ? e.stack ?? e.message : String(e));
    return json({ error: "server_error", verified: false, entitled: false }, 500);
  }
});