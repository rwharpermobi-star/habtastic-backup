import type { User } from '@supabase/supabase-js';

export const COMMUNITY_TERMS_META_KEY = 'community_terms_accepted_at';

/**
 * True when the signed-in user has accepted the community/UGC rules.
 * Source of truth is Supabase auth user metadata (server-side).
 */
export function hasAcceptedCommunityTerms(user: User | null | undefined): boolean {
  const v = (user?.user_metadata as Record<string, unknown> | undefined)?.[COMMUNITY_TERMS_META_KEY];
  return typeof v === 'string' && v.length > 0;
}
