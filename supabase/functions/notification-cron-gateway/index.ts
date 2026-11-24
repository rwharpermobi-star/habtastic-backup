// Internal pg_cron gateway for notification dispatch.
//
// This function is intentionally public at the Supabase JWT gateway because
// pg_cron cannot mint a user JWT. It is NOT public logically: every request
// must present a 256-bit secret stored only in Supabase Vault. After validating
// that secret, it calls the real dispatcher with the service-role JWT. The real
// dispatcher itself has verify_jwt=true and rejects every role except service_role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const provided = (req.headers.get("x-internal-secret") || "").trim();
    if (provided.length < 32 || provided.length > 256) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRole) return json({ error: "server_error" }, 500);

    const admin = createClient(supabaseUrl, serviceRole);
    const { data: expected, error } = await admin.rpc("get_notification_dispatcher_secret");
    if (
      error ||
      typeof expected !== "string" ||
      expected.length < 32 ||
      !constantTimeEqual(provided, expected)
    ) {
      return json({ error: "unauthorized" }, 401);
    }

    const upstream = await fetch(`${supabaseUrl}/functions/v1/notification-dispatcher`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRole}`,
        "apikey": serviceRole,
        "x-internal-secret": provided,
      },
      body: JSON.stringify({ ts: new Date().toISOString() }),
    });

    if (!upstream.ok) {
      console.error("[notification-cron-gateway] dispatcher failed", upstream.status);
      return json({ error: "dispatcher_failed" }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[notification-cron-gateway] unexpected error", error);
    return json({ error: "internal_error" }, 500);
  }
});
