import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { untypedSupabase } from "@/integrations/supabase/untyped";

export function useJournalPasscode() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasPasscode, setHasPasscode] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsUnlocked(false);
    setHasPasscode(null);
    setLoading(true);
    queryClient.removeQueries({ queryKey: ['journal-entries'] });
    queryClient.removeQueries({ queryKey: ['journal-memories'] });
    queryClient.removeQueries({ queryKey: ['journal-folders'] });
    if (!user) {
      setLoading(false);
      return () => { active = false; };
    }
    void (async () => {
      const { data, error } = await untypedSupabase.rpc('journal_pin_status');
      if (active) {
        setHasPasscode(error ? null : data === true);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.id, queryClient]);

  const createPasscode = useCallback(async (passcode: string) => {
    if (!user) return false;
    const { data, error } = await untypedSupabase.rpc('journal_pin_set', { p_pin: passcode });
    if (error || data !== true) return false;
    setHasPasscode(true);
    setIsUnlocked(true);
    return true;
  }, [user]);

  const updatePasscode = useCallback(async (_newPasscode: string) => {
    // Changing a PIN needs a separate server operation that verifies the old PIN.
    return false;
  }, []);

  const verifyPasscode = useCallback(async (passcode: string) => {
    if (!user) return false;
    const { data, error } = await untypedSupabase.rpc('journal_pin_verify', { p_pin: passcode });
    if (error || data !== true) return false;
    setIsUnlocked(true);
    return true;
  }, [user]);

  const lock = useCallback(() => {
    setIsUnlocked(false);
    queryClient.removeQueries({ queryKey: ['journal-entries'] });
    queryClient.removeQueries({ queryKey: ['journal-memories'] });
    queryClient.removeQueries({ queryKey: ['journal-folders'] });
    void untypedSupabase.rpc('journal_pin_lock');
  }, [queryClient]);

  return { isUnlocked, hasPasscode, loading, createPasscode, updatePasscode, verifyPasscode, lock };
}
