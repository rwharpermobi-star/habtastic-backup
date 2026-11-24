// Sends a single test push notification to the CALLING user's own devices.
//
// Covers both transports:
//   * native  -> device_tokens (Android FCM v1 / iOS APNs) via _shared/nativePush.ts
//   * web     -> push_subscriptions via VAPID web-push
//
// Security: the target user is always resolved from the caller's JWT — there is
// no way to address someone else's device. Service credentials (FCM service
// account, VAPID private key, service-role key) never leave the function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { sendNativePush, nativePushConfigured } from "../_shared/nativePush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:info@habtastic.com";

let vapidReady = false;
try {
  if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    vapidReady = true;
  }
} catch (e) {
  console.error("VAPID setup failed", e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let customTitle: string | undefined;
    let customBody: string | undefined;
    let only: "native" | "web" | undefined;
    if (req.method === "POST" && req.headers.get("content-type")?.includes("application/json")) {
      const raw = await req.json().catch(() => ({}));
      if (typeof raw?.title === "string") customTitle = raw.title.slice(0, 120);
      if (typeof raw?.body === "string") customBody = raw.body.slice(0, 240);
      if (raw?.transport === "native" || raw?.transport === "web") only = raw.transport;
    }

    const title = customTitle || "HabTastic ⚡ Test reminder";
    const body = customBody || "Push notifications are working! 🎉";
    const tag = `test:${Date.now()}`;

    // ---- native (Android / iOS) -----------------------------------------
    const native = { tokens: 0, sent: 0, failed: 0, removed: 0, configured: nativePushConfigured() };
    if (only !== "web") {
      const { data: tokens, error: tErr } = await admin
        .from("device_tokens")
        .select("token, platform")
        .eq("user_id", user.id);
      if (tErr) throw tErr;
      native.tokens = tokens?.length ?? 0;
      if (tokens?.length) {
        const result = await sendNativePush(
          tokens as { token: string; platform: string }[],
          { title, body, tag, url: "/" },
        );
        native.sent = result.sent;
        native.failed = result.failed.length;
        // FCM/APNs reported these tokens as permanently dead — prune them so
        // the dispatcher stops wasting sends on uninstalled devices.
        if (result.invalid.length) {
          await admin.from("device_tokens").delete().in("token", result.invalid);
          native.removed = result.invalid.length;
        }
      }
    }

    // ---- web push --------------------------------------------------------
    const web = { subscriptions: 0, sent: 0, removed: 0, configured: vapidReady };
    if (only !== "native" && vapidReady) {
      const { data: subs, error } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", user.id);
      if (error) throw error;
      web.subscriptions = subs?.length ?? 0;
      const payload = JSON.stringify({ title, body, tag, url: "/" });
      const dead: string[] = [];
      await Promise.all((subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 },
          );
          web.sent++;
        } catch (e: unknown) {
          const err = e as { statusCode?: number; body?: string };
          console.warn("web push failed", err?.statusCode, err?.body);
          if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.endpoint);
        }
      }));
      if (dead.length) {
        await admin.from("push_subscriptions").delete().in("endpoint", dead);
        web.removed = dead.length;
      }
    }

    const sent = native.sent + web.sent;
    const targets = native.tokens + web.subscriptions;
    const message = targets === 0
      ? "No registered devices found. Enable notifications first."
      : sent === 0
        ? "Devices are registered but no push was accepted — check the function logs."
        : `Sent ${sent} test push notification(s).`;

    console.log("[send-test-push]", { user_id: user.id, native, web });
    return json({ ok: sent > 0, sent, targets, message, native, web });
  } catch (e) {
    console.error("[send-test-push] error", e);
    return json({ error: "Test push failed" }, 500);
  }
});
