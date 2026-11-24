import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldCheck } from 'lucide-react';
import { useJournalPasscode } from '@/hooks/useJournalPasscode';
import { toast } from 'sonner';

export const JournalPasscodeGate = memo(function JournalPasscodeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isUnlocked, hasPasscode, loading, createPasscode, verifyPasscode } = useJournalPasscode();
  const [code, setCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [submitting, setSubmitting] = useState(false);
  const [shaking, setShaking] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  // Setup flow – first time
  if (hasPasscode === false) {
    const handleCreate = async (enteredCode = step === 'enter' ? code : confirmCode) => {
      if (step === 'enter') {
        if (enteredCode.length < 4) {
          toast.error('Passcode must be at least 4 digits');
          return;
        }
        setStep('confirm');
        return;
      }
      if (enteredCode !== code) {
        toast.error('Passcodes do not match');
        setConfirmCode('');
        return;
      }
      setSubmitting(true);
      const ok = await createPasscode(code);
      setSubmitting(false);
      if (!ok) toast.error('Failed to save passcode');
      else toast.success('Journal passcode set! 🔒');
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm space-y-6 text-center"
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Protect Your Journal</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {step === 'enter'
                ? 'Create a passcode to keep your thoughts private'
                : 'Confirm your passcode'}
            </p>
          </div>

          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={step === 'enter' ? code : confirmCode}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                if (step === 'enter') setCode(v);
                else setConfirmCode(v);
                if (v.length === 4) setTimeout(() => handleCreate(v), 100);
              }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              autoFocus
            />
            <div className="flex justify-center gap-4">
              {Array.from({ length: 4 }).map((_, i) => {
                const currentCode = step === 'enter' ? code : confirmCode;
                return (
                  <div
                    key={i}
                    className={`w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                      currentCode.length === i
                        ? 'border-primary bg-primary/10 scale-105'
                        : currentCode.length > i
                        ? 'border-primary/50 bg-card'
                        : 'border-border bg-card'
                    }`}
                  >
                    {currentCode[i] ? (
                      <div className="w-3 h-3 rounded-full bg-foreground" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => void handleCreate()}
            disabled={submitting || (step === 'enter' ? code.length < 4 : confirmCode.length < 4)}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 transition-all hover:opacity-90"
          >
            {submitting ? 'Saving...' : step === 'enter' ? 'Continue' : 'Set Passcode'}
          </button>

          {step === 'confirm' && (
            <button
              onClick={() => { setStep('enter'); setConfirmCode(''); }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Go back
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // Unlock flow – passcode already set
  const handleUnlock = async (enteredCode = code) => {
    if (enteredCode.length < 4 || submitting) return;
    setSubmitting(true);
    const ok = await verifyPasscode(enteredCode);
    setSubmitting(false);
    if (!ok) {
      toast.error('Incorrect passcode');
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setCode('');
      }, 500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Journal Locked</h2>
        </div>

        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4);
              setCode(v);
              if (v.length === 4) setTimeout(() => handleUnlock(v), 100);
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            autoFocus
          />
          <motion.div
            animate={{ x: shaking ? [0, -10, 10, -10, 10, 0] : 0 }}
            transition={{ duration: 0.4 }}
            className="flex justify-center gap-4"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`w-14 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                  shaking
                    ? 'border-destructive bg-destructive/10'
                    : code.length === i
                    ? 'border-primary bg-primary/10 scale-105'
                    : code.length > i
                    ? 'border-primary/50 bg-card'
                    : 'border-border bg-card'
                }`}
              >
                {code[i] ? (
                  <div className="w-3 h-3 rounded-full bg-foreground" />
                ) : null}
              </div>
            ))}
          </motion.div>
        </div>

        <button
          onClick={() => void handleUnlock()}
          disabled={submitting || code.length < 4}
          className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 transition-all hover:opacity-90"
        >
          {submitting ? 'Checking...' : 'Unlock'}
        </button>
      </motion.div>
    </div>
  );
});
