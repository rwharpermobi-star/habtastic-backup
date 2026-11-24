import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated caller to prevent abuse of expensive ElevenLabs API
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("Missing ELEVENLABS_API_KEY");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate the JWT
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rl = await enforceRateLimit(authClient, [
      { action: "generate_bg_music_hour", windowSeconds: 3600, max: 5 },
      { action: "generate_bg_music_day", windowSeconds: 86400, max: 20 },
    ], { name: "generate-bg-music", userId: user.id, corsHeaders });
    if (rl) return rl;

    // Try to get existing track
    const { data: existingFile } = await supabase.storage
      .from("audio")
      .createSignedUrl("bg-music/chill-track.mp3", 3600);

    if (existingFile?.signedUrl) {
      return new Response(JSON.stringify({ url: existingFile.signedUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate new chill track via ElevenLabs
    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "Chill lofi ambient music, smooth and soothing, soft piano with gentle beats, calm relaxing atmosphere, perfect for meditation and focus, warm tones, minimal and peaceful",
        duration_seconds: 120,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs error: ${response.status} - ${errText}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Upload to storage for caching
    const { error: uploadError } = await supabase.storage
      .from("audio")
      .upload("bg-music/chill-track.mp3", audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Still return the audio even if upload fails
      return new Response(audioBuffer, {
        headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
      });
    }

    const { data: signedUrl } = await supabase.storage
      .from("audio")
      .createSignedUrl("bg-music/chill-track.mp3", 3600);

    return new Response(JSON.stringify({ url: signedUrl?.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-bg-music error:", error);
    return new Response(JSON.stringify({ error: "music_generation_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
