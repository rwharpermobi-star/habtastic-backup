const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const prefix = typeof body?.prefix === "string" ? body.prefix.trim().toUpperCase() : "";

    // HIBP's Pwned Passwords range API requires exactly the first five
    // characters of a SHA-1 hash. The raw password and full hash never reach
    // this function.
    if (!/^[0-9A-F]{5}$/.test(prefix)) {
      return json({ error: "invalid_prefix" }, 400);
    }

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "user-agent": "HabTastic AI Password Safety/1.0",
        "Add-Padding": "true",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return json({ error: "password_safety_unavailable" }, 502);
    }

    return new Response(await response.text(), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[pwned-password-range] request failed", error);
    return json({ error: "password_safety_unavailable" }, 502);
  }
});
