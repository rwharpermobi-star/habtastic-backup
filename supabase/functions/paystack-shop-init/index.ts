// Initialize a one-time Paystack transaction for a Coin Store product.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, paystack, getEnvironment, CURRENCY, isAllowedCallbackUrl } from "../_shared/paystack.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const SHOP_RETIRED = true;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Coin Store is retired. Refuse all new one-time digital-goods checkouts so
  // no client (including the Android app) can start one.
  if (SHOP_RETIRED) {
    return new Response(JSON.stringify({ error: "The store is closed." }), {
      status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const rl = await enforceRateLimit(supabase, [
      { action: "paystack_shop_init_min", windowSeconds: 60, max: 5 },
      { action: "paystack_shop_init_hour", windowSeconds: 3600, max: 30 },
    ], { name: "paystack-shop-init", userId: user.id, corsHeaders });
    if (rl) return rl;

    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body.productId;
    const callbackUrl: string | undefined = body.callbackUrl;
    if (!productId || !isAllowedCallbackUrl(callbackUrl)) {
      return new Response(JSON.stringify({ error: "Missing productId or invalid callbackUrl" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: product, error: prodErr } = await admin
      .from("shop_products")
      .select("id, name, usd_cents, is_active, available_until")
      .eq("id", productId)
      .maybeSingle();
    if (prodErr || !product || !product.is_active) {
      return new Response(JSON.stringify({ error: "Product unavailable" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (product.available_until && new Date(product.available_until) < new Date()) {
      return new Response(JSON.stringify({ error: "Product expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = `htshop_${user.id.replace(/-/g, "").slice(0, 10)}_${Date.now()}`;
    const init = await paystack<any>(`/transaction/initialize`, {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: product.usd_cents,
        currency: CURRENCY,
        reference,
        callback_url: callbackUrl,
        metadata: {
          user_id: user.id,
          product_id: product.id,
          kind: "shop",
        },
      }),
    });

    await admin.from("shop_orders").insert({
      user_id: user.id,
      product_id: product.id,
      paystack_reference: reference,
      amount_cents: product.usd_cents,
      currency: CURRENCY,
      status: "pending",
      metadata: { environment: getEnvironment() },
    });

    return new Response(
      JSON.stringify({ authorization_url: init?.data?.authorization_url, reference }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("paystack-shop-init error:", e);
    return new Response(JSON.stringify({ error: "Payment checkout temporarily unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
