import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Winston's voice — ElevenLabs "Adam", the voice Winston used throughout
// September 2026 (the one the owner asked for).
const DEFAULT_VOICE = {
  voiceId: "pNInz6obpgDQGcFmaJgB",
  stability: 0.45,
  similarity_boost: 0.80,
  style: 0.60,
  speed: 0.95,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rl = await enforceRateLimit(supabase, [
      { action: "elevenlabs_tts_min", windowSeconds: 60, max: 30 },
      { action: "elevenlabs_tts_day", windowSeconds: 86400, max: 500 },
    ], { name: "elevenlabs-tts", userId: user.id, corsHeaders });
    if (rl) return rl;

    const body = await req.json();
    let { text } = body;
    const { speed, voiceId, style, stability } = body;

    if (!text || typeof text !== "string" || text.length > 5000) {
      return new Response(JSON.stringify({ error: "Invalid text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    text = text
      .replace(/\./g, "… ")
      .replace(/,/g, ", ");

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY is not configured for elevenlabs-tts");
      return new Response(JSON.stringify({ error: "Winston voice service is not configured", code: "tts_not_configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clients may still send the Nov 14-21 Winston voice ID. Map it (and Adam)
    // to Winston's current voice so every client gets the same voice without
    // a new build. Any other voice ID passes through unchanged.
    const LEGACY_WINSTON_VOICE_IDS = new Set(["pNInz6obpgDQGcFmaJgB", "bIHbv24MWmeRgasZH58o"]);
    const selectedVoice = !voiceId || LEGACY_WINSTON_VOICE_IDS.has(voiceId)
      ? DEFAULT_VOICE.voiceId
      : voiceId;
    const selectedSpeed = typeof speed === "number" ? Math.max(0.7, Math.min(1.2, speed)) : DEFAULT_VOICE.speed;
    const selectedStyle = typeof style === "number" ? Math.max(0, Math.min(1, style)) : DEFAULT_VOICE.style;
    const selectedStability = typeof stability === "number" ? Math.max(0, Math.min(1, stability)) : DEFAULT_VOICE.stability;

    // Use streaming endpoint + turbo model + low-latency MP3 for fastest TTFB.
    // `optimize_streaming_latency=3` trims first-byte time aggressively;
    // `mp3_22050_32` is much smaller than 44.1k/128 and still sounds natural for speech.
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}/stream?output_format=mp3_22050_32&optimize_streaming_latency=3`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: selectedStability,
            similarity_boost: DEFAULT_VOICE.similarity_boost,
            style: selectedStyle,
            use_speaker_boost: true,
            speed: selectedSpeed,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs error:", response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        return new Response(JSON.stringify({ error: "Voice provider rejected its credentials", code: "voice_provider_auth_failed" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Winston voice rate limit reached. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Winston voice credits are exhausted. Please top up the ElevenLabs account." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Voice generation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the response back
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e) {
    console.error("elevenlabs-tts error:", e);
    return new Response(JSON.stringify({ error: "tts_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
