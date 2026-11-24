// Batch translates short UI strings via Lovable AI.
// Public function (no auth) — only translates text the client sends.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ar: "Arabic",
  arz: "Egyptian Arabic (Masri)",
  hi: "Hindi",
  zh: "Simplified Chinese",
  zu: "Zulu",
  af: "Afrikaans",
  sw: "Swahili",
  xh: "isiXhosa",
  yo: "Yoruba",
  ha: "Hausa",
  ta: "Tamil",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require an authenticated user (prevents anonymous credit-burning).
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { texts, targetLang } = await req.json();

    if (!Array.isArray(texts) || texts.length === 0 || texts.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid texts (1–200 strings required)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!targetLang || typeof targetLang !== "string" || !LANG_NAMES[targetLang]) {
      return new Response(JSON.stringify({ error: "Unsupported targetLang" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langName = LANG_NAMES[targetLang];

    // English just echoes back — saves a round-trip
    if (targetLang === "en") {
      return new Response(JSON.stringify({ translations: texts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap each string to a sane length
    const safeTexts = texts.map((t: any) => String(t).slice(0, 400));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You translate UI strings for a habit-tracking app called HabTastic. The AI coach is named "Winston".
Rules:
- Translate to ${langName}.
- Keep the SAME emojis and formatting.
- Keep proper nouns "HabTastic" and "Winston" untranslated.
- Keep placeholders like {{name}}, {x}, %s exactly as-is.
- Keep tone short, punchy, friendly.
- Do NOT add explanations or quotes.
- If a string is already in ${langName} or is just a number/symbol, return it unchanged.`;

    const userPrompt = `Translate each item in this JSON array to ${langName}. Return ONLY a JSON object: {"items":[...]} with the same length and order.
Input:
${JSON.stringify(safeTexts)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Translation service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    let items = Array.isArray(parsed.items) ? parsed.items : null;

    // Defensive: fall back to originals if shape is wrong
    if (!items || items.length !== safeTexts.length) {
      items = safeTexts;
    }

    const translations = items.map((v: any, i: number) =>
      typeof v === "string" && v.length > 0 ? v : safeTexts[i]
    );

    return new Response(JSON.stringify({ translations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-batch error", e);
    return new Response(JSON.stringify({ error: "translation_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
