import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { COMMUNITY_TERMS_META_KEY } from '@/lib/communityTerms';

export const COMMUNITY_TERMS_KEY = COMMUNITY_TERMS_META_KEY;

/**
 * Community/UGC rules acceptance, stored server-side in Supabase auth user
 * metadata (never only in localStorage) so it follows the account across
 * devices and reinstalls.
 */
export function useCommunityTerms() {
  const { user } = useAuth();
  const metaValue = (user?.user_metadata as Record<string, unknown> | undefined)?.[COMMUNITY_TERMS_KEY];
  const [acceptedAt, setAcceptedAt] = useState<string | null>(
    typeof metaValue === 'string' ? metaValue : null,
  );
  const [saving, setSaving] = useState(false);

  // Keep in sync when the auth user refreshes (USER_UPDATED / session hydrate).
  useEffect(() => {
    setAcceptedAt(typeof metaValue === 'string' ? metaValue : null);
  }, [metaValue]);

  const accept = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    const ts = new Date().toISOString();
    const { error } = await supabase.auth.updateUser({ data: { [COMMUNITY_TERMS_KEY]: ts } });
    setSaving(false);
    if (error) return false;
    setAcceptedAt(ts);
    return true;
  }, [user]);

  return { accepted: Boolean(acceptedAt), acceptedAt, accept, saving };
}
