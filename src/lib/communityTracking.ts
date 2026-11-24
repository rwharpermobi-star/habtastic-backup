import { supabase } from '@/integrations/supabase/client';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export type CommunityPlatform = 'facebook' | 'tiktok';

/**
 * Fire-and-forget click tracking for community buttons.
 * Never throws; failures are logged to the console only.
 */
export async function trackCommunityClick(
  platform: CommunityPlatform,
  source?: string,
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // Tracking rows are owner-scoped; skip silently for signed-out visitors.
    if (!user) return;
    await untypedSupabase.from('community_clicks').insert({
      destination: platform,
      metadata: { source: source ?? null },
      user_id: user.id,
    });
  } catch (err) {
    // Tracking must never block UX
    console.warn('[community-click] tracking failed', err);
  }
}
