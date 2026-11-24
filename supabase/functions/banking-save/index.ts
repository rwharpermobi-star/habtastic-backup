import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  password: string;
  holder: string;
  bank: string;
  account_number: string;
  account_type: "savings" | "cheque" | "business";
  branch_code: string;
  country: string;
  currency: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthenticated" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const KEY = Deno.env.get("BANK_ENCRYPTION_KEY");
    if (!KEY) return json({ error: "server_misconfigured" }, 500);

    // Verify user from JWT
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user?.email) return json({ error: "unauthenticated" }, 401);
    const user = userRes.user;

    const body = (await req.json()) as Body;
    // Re-auth with password
    const reauth = await userClient.auth.signInWithPassword({
      email: user.email!,
      password: body.password ?? "",
    });
    if (reauth.error) return json({ error: "invalid_password" }, 401);

    // Basic validation
    const required = ["holder", "bank", "account_number", "account_type", "branch_code", "country", "currency"] as const;
    for (const k of required) {
      if (!body[k] || String(body[k]).trim().length === 0) return json({ error: `missing_${k}` }, 400);
    }
    if (!["savings", "cheque", "business"].includes(body.account_type)) return json({ error: "invalid_account_type" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const ip = req.headers.get("x-forwarded-for") ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    const { error: rpcErr } = await admin.rpc("save_bank_account", {
      _user_id: user.id,
      _holder: body.holder,
      _bank: body.bank,
      _account_number: body.account_number,
      _account_type: body.account_type,
      _branch_code: body.branch_code,
      _country: body.country,
      _currency: body.currency,
      _key: KEY,
      _ip: ip,
      _ua: ua,
    });
    if (rpcErr) {
      console.error("[banking-save] save_bank_account failed", {
        code: rpcErr.code,
      });
      return json({ error: "bank_details_save_failed" }, 400);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[banking-save] unexpected error");
    return json({ error: "server_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
