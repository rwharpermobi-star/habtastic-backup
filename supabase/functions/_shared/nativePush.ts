// Shared FCM v1 + APNs push sender for edge functions.
// Both are no-ops (return { sent: 0, skipped: n }) when the relevant
// credentials are missing so local/dev deployments stay green.

interface NativeTokenRow {
  id?: string;
  token: string;
  platform: "android" | "ios" | "web";
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  tag?: string;
  url?: string;
}

// ---- FCM v1 (Android) --------------------------------------------------
// Requires FCM_SERVICE_ACCOUNT_JSON: the JSON downloaded from
// Firebase Console → Project Settings → Service accounts → Generate new private key.
let fcmAccessToken: { value: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<{ token: string; projectId: string } | null> {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  let sa: { client_email: string; private_key: string; project_id: string };
  try {
    sa = JSON.parse(raw);
  } catch (e) {
    console.warn("[nativePush] FCM_SERVICE_ACCOUNT_JSON invalid JSON", e);
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (fcmAccessToken && fcmAccessToken.expiresAt - 60 > now) {
    return { token: fcmAccessToken.value, projectId: sa.project_id };
  }
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const pkPem = sa.private_key.replace(/\\n/g, "\n");
  const key = await importPkcs8(pkPem, "RSASSA-PKCS1-v1_5", "SHA-256");
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    ),
  );
  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${sigB64}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    console.warn("[nativePush] FCM token exchange failed", res.status, await res.text());
    return null;
  }
  const j = await res.json() as { access_token: string; expires_in: number };
  fcmAccessToken = { value: j.access_token, expiresAt: now + j.expires_in };
  return { token: j.access_token, projectId: sa.project_id };
}

async function importPkcs8(pem: string, name: string, hash: string) {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8", bin, { name, hash }, false, ["sign"],
  );
}

// `true` = delivered, `false` = transient failure, `"invalid"` = token is dead
// and must be deleted from device_tokens.
type SendResult = boolean | "invalid";

async function sendFcm(token: string, payload: PushPayload): Promise<SendResult> {
  const creds = await getFcmAccessToken();
  if (!creds) return false;
  const msg = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: {
        ...(payload.data || {}),
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.tag ? { tag: payload.tag } : {}),
      },
      android: {
        priority: "HIGH" as const,
        notification: {
          tag: payload.tag,
          // Must match ANDROID_CHANNEL_ID in src/hooks/useNativePush.ts and the
          // default_notification_channel_id meta-data in AndroidManifest.xml,
          // otherwise Android 8+ silently drops background notifications.
          channel_id: "habtastic_default",
          // Monochrome status-bar icon generated in the Android CI build.
          // Android draws small icons as an alpha mask, so a colored launcher
          // mipmap would render as a white square.
          icon: "ic_stat_habtastic",
          color: "#3B82F6",
        },
      },

    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(msg),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.warn("[nativePush] FCM send failed", res.status, text);
    // 404 UNREGISTERED / 400 INVALID_ARGUMENT on the token => permanently dead.
    if (
      res.status === 404 ||
      text.includes("UNREGISTERED") ||
      text.includes("registration-token-not-registered") ||
      (res.status === 400 && text.includes("INVALID_ARGUMENT"))
    ) return "invalid";
    return false;
  }
  return true;
}

// ---- APNs (iOS) --------------------------------------------------------
// Requires APNS_AUTH_KEY_P8 (the p8 contents), APNS_KEY_ID, APNS_TEAM_ID,
// APNS_BUNDLE_ID, and optionally APNS_ENVIRONMENT=production|sandbox.
let apnsToken: { value: string; expiresAt: number } | null = null;

async function getApnsToken(): Promise<string | null> {
  const p8 = Deno.env.get("APNS_AUTH_KEY_P8");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!p8 || !keyId || !teamId) return null;
  const now = Math.floor(Date.now() / 1000);
  if (apnsToken && apnsToken.expiresAt - 60 > now) return apnsToken.value;
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claim = { iss: teamId, iat: now };
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const key = await importPkcs8(p8, "ECDSA", "SHA-256");
  const raw = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, key,
      new TextEncoder().encode(unsigned),
    ),
  );
  const sigB64 = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${sigB64}`;
  // Token is valid up to 60 min; refresh every 45 min.
  apnsToken = { value: jwt, expiresAt: now + 45 * 60 };
  return jwt;
}

async function sendApns(token: string, payload: PushPayload): Promise<SendResult> {
  const jwt = await getApnsToken();
  const bundle = Deno.env.get("APNS_BUNDLE_ID");
  if (!jwt || !bundle) return false;
  const env = Deno.env.get("APNS_ENVIRONMENT") || "production";
  const host = env === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  const body = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
      "thread-id": payload.tag,
    },
    url: payload.url,
    ...(payload.data || {}),
  };
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      Authorization: `bearer ${jwt}`,
      "apns-topic": bundle,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(payload.tag ? { "apns-collapse-id": payload.tag.slice(0, 64) } : {}),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 410) return "invalid"; // unregistered device
  if (!res.ok) {
    const text = await res.text();
    console.warn("[nativePush] APNs send failed", res.status, text);
    if (res.status === 400 && text.includes("BadDeviceToken")) return "invalid";
    return false;
  }
  return true;
}

// ---- Public entrypoint --------------------------------------------------
export async function sendNativePush(
  tokens: NativeTokenRow[],
  payload: PushPayload,
): Promise<{ sent: number; failed: string[]; invalid: string[] }> {
  if (!tokens.length) return { sent: 0, failed: [], invalid: [] };
  const failed: string[] = [];
  const invalid: string[] = [];
  let sent = 0;
  await Promise.all(tokens.map(async (t) => {
    try {
      const ok: SendResult = t.platform === "android"
        ? await sendFcm(t.token, payload)
        : t.platform === "ios"
          ? await sendApns(t.token, payload)
          : false;
      if (ok === true) sent++;
      else if (ok === "invalid") invalid.push(t.token);
      else failed.push(t.token);
    } catch (e) {
      console.warn("[nativePush] error", e);
      failed.push(t.token);
    }
  }));
  console.log("[nativePush] delivery summary", {
    sent, failed: failed.length, invalid: invalid.length,
  });
  return { sent, failed, invalid };
}

export function nativePushConfigured(): { fcm: boolean; apns: boolean } {
  return {
    fcm: !!Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"),
    apns: !!(Deno.env.get("APNS_AUTH_KEY_P8") &&
      Deno.env.get("APNS_KEY_ID") &&
      Deno.env.get("APNS_TEAM_ID") &&
      Deno.env.get("APNS_BUNDLE_ID")),
  };
}
