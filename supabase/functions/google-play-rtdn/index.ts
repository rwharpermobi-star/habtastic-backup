// Google Play Real-time Developer Notifications (RTDN) webhook.
//
// Security model:
// - Public at the Supabase gateway because Google Pub/Sub sends its own OIDC JWT.
// - Every request must carry a valid Google-signed OIDC token for this exact
//   endpoint audience. An optional configured service-account email further
//   pins the sender.
// - The notification body is never trusted for entitlement. The purchase token
//   is re-queried against the Google Play Android Publisher API and Premium is
//   derived only from the resulting Google-authoritative subscription row.
// - Processing is idempotent on (provider, provider_subscription_code).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildLifecycleEmails,
  classifyPlayNotification,
  decidePlayRevocation,
  formatPlayMoney,
  lookupVoidedReason,
  type RevocationReason,
  sendLifecycleEmails,
} from "../_shared/googlePlayLifecycle.ts";
import { parseServiceAccount } from "../_shared/googleServiceAccount.ts";
import { dispositionForPlayLookup, rtdnStatusFor } from "../_shared/rtdnDelivery.ts";

const PACKAGE_NAME = "app.lovable.habtastic";
const PLANS: Record<string, { basePlanId: string; interval: string }> = {
  habtastic_premium_monthly: { basePlanId: "monthly", interval: "monthly" },
  habtastic_premium_yearly: { basePlanId: "yearly", interval: "annually" },
};

const responseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

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

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.access_token) throw new Error("google_token_failed");
  return body.access_token as string;
}

async function verifyGooglePushIdentity(req: Request, supabaseUrl: string): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const idToken = auth.replace(/^Bearer\s+/i, "").trim();
  if (!idToken || idToken.length > 8192) return false;

  const tokenRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!tokenRes.ok) return false;

  const claims = await tokenRes.json().catch(() => null);
  if (!claims) return false;

  const expectedAudience =
    Deno.env.get("GOOGLE_PLAY_RTDN_AUDIENCE") ||
    `${supabaseUrl}/functions/v1/google-play-rtdn`;
  const expectedEmail = Deno.env.get("GOOGLE_PLAY_RTDN_PUSH_EMAIL")?.trim().toLowerCase() || "";

  const issuerOk = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  const audienceOk = claims.aud === expectedAudience;
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const emailOk = !expectedEmail || email === expectedEmail;

  return issuerOk && audienceOk && emailVerified && emailOk;
}

function decodePubSubData(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string" || !data || data.length > 32768) return null;
  try {
    const decoded = atob(data);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (!supabaseUrl) return json({ error: "server_error" }, 500);

  try {
    if (!(await verifyGooglePushIdentity(req, supabaseUrl))) {
      return json({ error: "unauthorized" }, 401);
    }

    const envelope = await req.json().catch(() => null);
    const message = envelope?.message;
    if (!message || typeof message !== "object") {
      return json({ error: "invalid_message" }, 400);
    }

    const event = decodePubSubData(message.data);
    if (!event || event.packageName !== PACKAGE_NAME) {
      return json({ error: "invalid_message" }, 400);
    }

    const notification = classifyPlayNotification(event);
    // Test notifications and non-subscription RTDNs (one-time products) carry
    // nothing for us; acknowledge them so Pub/Sub stops redelivering.
    if (event.testNotification && !notification.purchaseToken) return json({ ok: true, test: true });
    if (notification.unsupported) return json({ ok: true, ignored: true });

    const purchaseToken = notification.purchaseToken;
    if (!purchaseToken || purchaseToken.length > 4096) {
      return json({ error: "invalid_purchase_token" }, 400);
    }

    const serviceAccountJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) return json({ error: "server_error" }, 503);
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(serviceAccountJson);
    } catch (error) {
      // Bad/rotated key: retryable once the secret is fixed. 5xx + subscription
      // backoff keeps this from hammering Google.
      console.error("[google-play-rtdn] Google access token failed", String(error));
      return json({ error: "provider_auth_failed" }, 503);
    }

    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    let playRes: Response;
    try {
      playRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      console.warn("[google-play-rtdn] provider lookup network error", String(error));
      return json({ error: "provider_unreachable" }, 503);
    }
    const sub = await playRes.json().catch(() => null);
    if (!playRes.ok || !sub) {
      // Permanent failures (unknown/expired token) are acknowledged so Pub/Sub
      // stops redelivering; credential/temporary failures are retried with backoff.
      const lookupStatus = playRes.ok ? 502 : playRes.status;
      const disposition = dispositionForPlayLookup(lookupStatus);
      console.warn("[google-play-rtdn] provider lookup failed", playRes.status, disposition);
      return json(
        { error: "provider_verification_failed", acknowledged: disposition === "drop" },
        rtdnStatusFor(disposition),
      );
    }

    const accountId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (
      typeof accountId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)
    ) {
      console.warn("[google-play-rtdn] missing account binding");
      return json({ error: "account_binding_missing", acknowledged: true }, 200);
    }

    const lineItems: any[] = Array.isArray(sub.lineItems) ? sub.lineItems : [];
    const item = lineItems.find((li) => typeof li?.productId === "string" && PLANS[li.productId]);
    if (!item) return json({ error: "unknown_product", acknowledged: true }, 200);

    const productId = item.productId as string;
    const expected = PLANS[productId];
    const providerBasePlan = item?.offerDetails?.basePlanId;
    if (providerBasePlan && providerBasePlan !== expected.basePlanId) {
      return json({ error: "base_plan_mismatch", acknowledged: true }, 200);
    }

    const state = String(sub.subscriptionState ?? "");
    const expiryIso = typeof item.expiryTime === "string" ? item.expiryTime : null;
    const expiresInFuture = !!expiryIso && new Date(expiryIso).getTime() > Date.now();

    const status =
      state === "SUBSCRIPTION_STATE_ACTIVE" || state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
        ? "active"
        : state === "SUBSCRIPTION_STATE_CANCELED" && expiresInFuture
          ? "non-renewing"
          : "inactive";

    const admin = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id")
      .eq("user_id", accountId)
      .maybeSingle();

    if (profileError || !profile) {
      console.warn("[google-play-rtdn] account binding does not map to a profile");
      return json({ error: "account_not_found", acknowledged: true }, 200);
    }

    // Refunds and chargebacks: remove the refunded Premium time BEFORE the
    // upsert, while the row still holds the previously granted period end.
    // The DB function is idempotent per (purchase token, order) and a DB
    // trigger stops a refunded order from ever re-granting Premium.
    const latestOrderId = typeof sub.latestOrderId === "string" ? sub.latestOrderId : null;
    let refundReason: RevocationReason | null = null;
    let premiumRemoved = false;
    let revoked = false;
    if (notification.kind === "refund") {
      const voidedReason = notification.label === "VOIDED_PURCHASE"
        ? await lookupVoidedReason({
          accessToken,
          purchaseToken,
          orderId: notification.orderId,
          eventTimeMillis: notification.eventTimeMillis,
        })
        : null;
      const decision = decidePlayRevocation({
        notification,
        latestOrderId,
        googleEntitled: status !== "inactive",
        voidedReason,
      });
      refundReason = decision.reason ?? (voidedReason === 7 ? "chargeback" : "refund");
      console.log("[google-play-rtdn] refund decision", { revoke: decision.revoke, why: decision.why, reason: decision.reason });

      if (decision.revoke && decision.orderId && decision.reason) {
        const { data: revocation, error: revocationError } = await admin.rpc("apply_google_play_revocation", {
          _user_id: accountId,
          _purchase_token: purchaseToken,
          _order_id: decision.orderId,
          _reason: decision.reason,
        });
        if (revocationError) {
          console.error("[google-play-rtdn] revocation failed", revocationError.code);
          return json({ error: "server_error" }, 500);
        }
        revoked = true;
        premiumRemoved = !!(revocation as { premium_removed?: boolean } | null)?.premium_removed;
      }
    }

    const row = {
      user_id: accountId,
      provider: "google_play",
      provider_customer_id: sub.linkedPurchaseToken ?? null,
      provider_subscription_code: purchaseToken,
      plan_code: productId,
      plan_interval: expected.interval,
      status,
      currency: item.autoRenewingPlan?.recurringPrice?.currencyCode ?? null,
      amount: item.autoRenewingPlan?.recurringPrice?.units
        ? Number(item.autoRenewingPlan.recurringPrice.units)
        : null,
      current_period_start: sub.startTime ?? null,
      current_period_end: expiryIso,
      next_payment_date: item.autoRenewingPlan?.autoRenewEnabled ? expiryIso : null,
      cancel_at_period_end:
        state === "SUBSCRIPTION_STATE_CANCELED" ||
        item.autoRenewingPlan?.autoRenewEnabled === false,
      metadata: {
        source: "google_play_rtdn",
        verification_authority: "google_play_api",
        notification_type: notification.notificationType,
        notification_label: notification.label,
        base_plan_id: expected.basePlanId,
        latest_order_id: latestOrderId,
        subscription_state: state,
        acknowledgement_state: sub.acknowledgementState ?? null,
        pubsub_message_id: typeof message.messageId === "string" ? message.messageId : null,
        verified_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await admin
      .from("subscriptions")
      .upsert(row, { onConflict: "provider,provider_subscription_code" });

    if (upsertError) {
      console.error("[google-play-rtdn] subscription save failed", upsertError.code);
      return json({ error: "server_error" }, 500);
    }

    // Acknowledge only after Google verified the purchase and the server saved
    // its entitlement. A 5xx asks Pub/Sub to retry if Google is temporarily down;
    // on retry, subscriptionsv2.get tells us whether it was acknowledged.
    if (!revoked && status !== "inactive" && sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
      const acknowledgeUrl =
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}` +
        `/purchases/subscriptions/${encodeURIComponent(productId)}` +
        `/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
      const acknowledgeRes = await fetch(acknowledgeUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!acknowledgeRes.ok) {
        console.error("[google-play-rtdn] acknowledgement failed", acknowledgeRes.status);
        return json({ error: "acknowledgement_failed" }, 500);
      }
    }

    // Customer + admin lifecycle emails. Best-effort and deduplicated, so a
    // redelivered notification never sends twice and an email failure never
    // changes the entitlement outcome above.
    if (notification.kind) {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const task = (async () => {
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(accountId);
          const customerEmail = authUser?.user?.email?.trim().toLowerCase() || null;
          const price = item.autoRenewingPlan?.recurringPrice;
          const requests = await buildLifecycleEmails({
            kind: notification.kind!,
            notificationType: notification.notificationType,
            purchaseToken,
            userId: accountId,
            productId,
            interval: expected.interval,
            amount: formatPlayMoney(price?.units, price?.nanos),
            currency: price?.currencyCode ?? null,
            periodEnd: expiryIso,
            orderId: notification.orderId ?? latestOrderId,
            eventTimeMillis: notification.eventTimeMillis,
            refundReason,
            premiumRemoved,
          }, customerEmail);
          await sendLifecycleEmails(requests, { supabaseUrl, serviceRoleKey });
        } catch (error) {
          console.warn("[google-play-rtdn] lifecycle email skipped", String(error));
        }
      })();
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(task);
      else await task;
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[google-play-rtdn] unexpected error", error);
    return json({ error: "server_error" }, 500);
  }
});
