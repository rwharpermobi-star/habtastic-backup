import { forwardRef, useEffect, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { MOOD_OPTIONS, MoodEmoji, useMoodLog } from '@/hooks/useMoodLog';

interface MoodCheckSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitId?: string;
  habitName?: string;
  habitEmoji?: string;
  xp?: number;
  xpPending?: boolean;
  dailyGoalComplete?: boolean;
  onUndo?: () => void | Promise<void>;
}

const MoodCheckSheet = forwardRef<HTMLDivElement, MoodCheckSheetProps>(function MoodCheckSheet(
  {
    open,
    onOpenChange,
    habitId,
    habitName,
    habitEmoji,
    xp = 0,
    xpPending = false,
    dailyGoalComplete = false,
    onUndo,
  },
  _ref,
) {
  const { logMood } = useMoodLog();
  const [selected, setSelected] = useState<{ mood: MoodEmoji; intensity: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, habitId]);

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (selected) await logMood(selected.mood, selected.intensity, habitId);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const undo = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onUndo?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[28px] border-primary/35 bg-card/95 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-10px_40px_hsl(var(--primary)/0.18)] backdrop-blur-xl"
      >
        <SheetTitle className="sr-only">Habit completed</SheetTitle>

        <div className="mx-auto w-full max-w-lg">
          <div className="flex items-start gap-3">
            <div className="gradient-primary mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_0_18px_hsl(var(--primary)/0.35)]">
              <Check className="h-6 w-6" strokeWidth={3} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold leading-tight text-foreground">Nice work!</p>
              <p className="mt-0.5 text-sm font-bold text-primary">{xpPending ? 'XP pending sync' : `+${xp} XP`}</p>
              {habitName && (
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  <span aria-hidden="true">{habitEmoji || '✓'}</span>{' '}{habitName}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1">
              {onUndo && (
                <button
                  type="button"
                  onClick={undo}
                  disabled={saving}
                  className="flex h-9 items-center gap-1 rounded-xl border border-border/70 bg-secondary/60 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {dailyGoalComplete && (
            <div className="mt-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-center text-xs font-semibold text-primary">
              🔥 Daily goal complete — all habits done!
            </div>
          )}

          <div className="my-4 h-px bg-border/60" />

          <p className="text-center text-base font-extrabold text-foreground">
            How did it feel? <span aria-hidden="true">💭</span>
          </p>

          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {MOOD_OPTIONS.map((m) => {
              const active = selected?.mood === m.emoji;
              return (
                <button
                  key={m.emoji}
                  type="button"
                  onClick={() => setSelected({ mood: m.emoji, intensity: m.intensity })}
                  aria-label={m.label}
                  aria-pressed={active}
                  className={`flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-all active:scale-95 ${
                    active
                      ? 'border-primary bg-primary/15 shadow-[0_0_12px_hsl(var(--primary)/0.22)]'
                      : 'border-transparent bg-secondary/35 hover:bg-secondary/60'
                  }`}
                >
                  <span className="text-2xl" aria-hidden="true">{m.emoji}</span>
                  <span className="max-w-full truncate text-[10px] text-muted-foreground">{m.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={finish}
            disabled={saving}
            className="gradient-primary mt-4 w-full rounded-2xl py-3 text-sm font-extrabold text-white shadow-[0_0_18px_hsl(var(--primary)/0.25)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {selected ? 'Done' : 'Continue'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
});

export default MoodCheckSheet;
