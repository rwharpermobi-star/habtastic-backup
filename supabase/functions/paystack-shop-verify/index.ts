import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: auth } = await client.auth.getUser();
    if (!auth?.user) return json({ error: "Unauthorized" }, 401);

    const raw = await req.text();
    let reference: string | undefined;
    if (raw) { try { reference = JSON.parse(raw)?.reference; } catch { /* ignore: best effort */ } }
    if (!reference) reference = new URL(req.url).searchParams.get("reference") ?? undefined;
    if (!reference || reference.length > 160 || !/^[A-Za-z0-9._-]+$/.test(reference)) return json({ error: "Invalid reference" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order } = await admin.from("shop_orders").select("id,user_id,status").eq("paystack_reference", reference).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.user_id !== auth.user.id) return json({ error: "User mismatch" }, 403);

    // SECURITY: this browser-callable endpoint is status-only. It never marks an
    // order paid and never fulfills/rewards it. Fulfillment is webhook-authoritative.
    const key = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!key) throw new Error("Payment provider unavailable");
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${key}` } });
    const verified = await res.json().catch(() => ({}));
    if (!res.ok || verified?.status === false) return json({ error: "Verification unavailable" }, 502);
    const data = verified?.data;
    const providerStatus = data?.status ?? "unknown";
    const providerUser = data?.metadata?.user_id;
    if (providerUser && providerUser !== auth.user.id) return json({ error: "User mismatch" }, 403);
    return json({ status: order.status, provider_status: providerStatus, fulfillment: order.status === "fulfilled" ? "fulfilled" : "awaiting_webhook" });
  } catch (e) {
    console.error("paystack-shop-verify status error", e);
    return json({ error: "Payment verification temporarily unavailable" }, 502);
  }
});