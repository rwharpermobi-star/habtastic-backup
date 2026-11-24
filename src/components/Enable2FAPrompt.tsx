import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const SNOOZE_KEY = 'enable2fa_snoozed_until';
const SNOOZE_DAYS = 7;

export default function Enable2FAPrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
        if (snoozedUntil && Date.now() < snoozedUntil) return;
        const { data } = await supabase.auth.mfa.listFactors();
        const enrolled = (data?.totp || []).some((f) => f.status === 'verified');
        if (!cancelled && !enrolled) setShow(true);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [user]);

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-5 mb-4"
        >
          <div className="glass rounded-card shadow-card border border-primary/30 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-foreground">Protect your account with 2FA 🛡️</p>
              <p className="text-caption text-muted-foreground mb-3">
                Add a second step at sign-in so only you can get in — even if your password leaks.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-9 rounded-btn gradient-primary text-white font-semibold"
                  onClick={() => { setShow(false); navigate('/settings/privacy'); }}
                >
                  Enable 2FA
                </Button>
                <Button size="sm" variant="ghost" className="h-9 rounded-btn text-muted-foreground" onClick={snooze}>
                  Remind me later
                </Button>
              </div>
            </div>
            <button
              onClick={snooze}
              aria-label="Dismiss"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
