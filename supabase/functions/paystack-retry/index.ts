import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anon || !serviceKey) return json({ error: "server_unavailable" }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth?.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: roleRow, error: roleError } = await admin.from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (roleError || !roleRow) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  if (!eventId) return json({ error: "event_id required" }, 400);

  const { data: ev, error: eventError } = await admin.from("paystack_webhook_events")
    .select("id,event_type,raw_payload,attempts")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !ev) return json({ error: "Event not found" }, 404);

  const raw = ev.raw_payload as any;
  const eventType = raw?.event ?? ev.event_type;
  const data = raw?.data ?? {};
  const attempts = Number(ev.attempts ?? 0) + 1;

  try {
    const response = await fetch(`${url}/functions/v1/paystack-process-event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventType, data, eventId: raw?.id ?? null }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && response.status >= 500) throw new Error(`processor_${response.status}`);

    await admin.from("paystack_webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      attempts,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: null,
      error_message: response.ok ? null : String(result?.reason ?? result?.error ?? "rejected").slice(0, 500),
      user_id: result?.userId ?? data?.metadata?.user_id ?? null,
    }).eq("id", ev.id);

    return json({ ok: true, processed: result?.processed ?? false, result });
  } catch (error) {
    await admin.from("paystack_webhook_events").update({
      status: "failed",
      attempts,
      last_attempt_at: new Date().toISOString(),
      error_message: String(error).slice(0, 1000),
    }).eq("id", ev.id);
    return json({ error: "retry_failed" }, 500);
  }
});
