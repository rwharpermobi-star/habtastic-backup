import { useState, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { HABIT_SAVE_ERRORS } from '@/lib/habitErrors';

interface QuickAddHabitBarProps {
  onAdd: (habit: {
    id?: string;
    name: string;
    emoji: string;
    color: string;
    frequency: string;
    category: string;
    difficulty: string;
    reminderTime?: string;
    customDays?: number[];
    soundMode?: string;
    verificationEnabled?: boolean;
    verificationQuestion?: string | null;
  }) => Promise<unknown>;
  disabled?: boolean;
}

/**
 * Single-line habit creation with smart defaults.
 * Hit Enter or tap the + to create a daily habit with ⭐ emoji.
 * Users can edit category/emoji/schedule later via the full dialog.
 */
export default function QuickAddHabitBar({ onAdd, disabled }: QuickAddHabitBarProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  // One ID per piece of typed text. Retrying the SAME text reuses the ID, so a
  // lost response can never create a duplicate. Changing the text starts a new
  // draft, so a different habit can never overwrite one that already saved.
  const draftIdRef = useRef<string | null>(null);

  const handleChange = (value: string) => {
    if (busyRef.current) return;
    draftIdRef.current = null;
    setName(value);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busyRef.current || disabled) return;
    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    busyRef.current = true;
    setBusy(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        onAdd({
          id: draftIdRef.current,
          name: trimmed,
          emoji: '⭐',
          color: 'primary',
          frequency: 'daily',
          category: 'custom',
          difficulty: 'medium',
          reminderTime: undefined,
          customDays: [],
          soundMode: 'normal',
          verificationEnabled: false,
          verificationQuestion: null,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(HABIT_SAVE_ERRORS.TIMEOUT)), 15_000);
        }),
      ]);
      draftIdRef.current = null;
      setName('');
      toast.success('Habit added — tap to customize anytime');
      // The input is read-only (not disabled) while saving, so it can take focus here.
      inputRef.current?.focus();
    } catch (error) {
      console.error('[QuickAddHabitBar] habit save failed', error);
      const code = error instanceof Error ? error.message : '';
      toast.error(code === HABIT_SAVE_ERRORS.FREE_LIMIT
        ? 'Free habit limit reached. Upgrade to add more habits.'
        : code === HABIT_SAVE_ERRORS.TIMEOUT
          ? 'Taking too long. Check your connection and tap + again.'
          : code === HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED
            ? 'Please sign in to add a habit.'
            : 'Could not save habit. Check your connection and tap + again.');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="glass rounded-card p-2 mb-4 shadow-card flex items-center gap-2 border border-primary/20">
      <Sparkles className="w-4 h-4 text-primary ml-2 shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={onKey}
        disabled={disabled}
        readOnly={busy}
        maxLength={60}
        placeholder="Quick add a habit… (e.g. Drink water)"
        aria-label="Quick add a new habit"
        aria-busy={busy}
        className={`flex-1 bg-transparent text-body text-foreground placeholder:text-muted-foreground outline-none px-1 py-2 min-w-0 disabled:opacity-50 ${busy ? 'opacity-60' : ''}`}
      />
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => { void submit(); }}
        disabled={!name.trim() || busy || disabled}
        aria-label="Add habit"
        className="h-10 w-10 rounded-full gradient-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
