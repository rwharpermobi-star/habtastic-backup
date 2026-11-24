import { useEffect, useState, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Clock, Send, Loader2, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { ensurePushSubscription, sendHabitTestPush } from '@/lib/webPush';
import type { DbHabit } from '@/hooks/useHabits';
import { HABIT_SAVE_ERRORS } from '@/lib/habitErrors';

interface Props {
  habit: DbHabit | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (id: string, updates: Partial<DbHabit>) => Promise<unknown>;
}

/**
 * Best-effort device notification setup. This runs AFTER the reminder has been
 * saved and never blocks or fails the save: a denied or stuck permission prompt
 * only produces a gentle heads-up.
 */
async function enableDevicePush() {
  try {
    await ensurePushSubscription();
  } catch (error) {
    console.error('[edit reminder] push subscription failed', error);
    toast('Reminder saved, but notifications are not enabled on this device yet.', {
      description: 'Allow notifications in your phone settings to receive it.',
    });
  }
}

/**
 * Compact bottom-sheet editor for a single habit's reminder time.
 * Lets users toggle reminders on/off, pick a time, and send a test push
 * so they can confirm notifications actually arrive.
 */
export default function EditReminderSheet({ habit, open, onOpenChange, onSave }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (habit) {
      setEnabled(!!habit.reminder_enabled);
      setTime(habit.reminder_time || '09:00');
    }
  }, [habit?.id]);

  if (!habit) return null;

  const timeInvalid = !!time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const timeMissing = enabled && !time;

  const save = async () => {
    if (savingRef.current) return;
    if (timeMissing) {
      setSaveError('Pick a reminder time.');
      return;
    }
    if (timeInvalid) {
      setSaveError('Use a valid time in HH:MM format');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Save the reminder first. Only the database write is raced against the
      // timeout, so a slow notification prompt can never cause a false failure.
      await Promise.race([
        onSave(habit.id, {
          reminder_enabled: enabled,
          reminder_time: enabled ? time : null,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(HABIT_SAVE_ERRORS.TIMEOUT)), 15_000);
        }),
      ]);
      toast.success(
        enabled ? `Reminder set for ${time}` : 'Reminder turned off',
        { description: `${habit.emoji} ${habit.name}` },
      );
      onOpenChange(false);
      if (enabled) void enableDevicePush();
    } catch (error) {
      console.error('[edit reminder] save failed', error);
      const message = error instanceof Error && error.message === HABIT_SAVE_ERRORS.TIMEOUT
        ? 'Taking too long. Check your connection and tap Save again.'
        : 'Could not save reminder. Your changes are still here; please retry.';
      setSaveError(message);
      toast.error(message);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      savingRef.current = false;
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const result = await sendHabitTestPush(habit.name, habit.emoji);
      if (result.needsPermission) {
        toast.error('Enable notifications first', {
          description: 'Allow notifications in your browser to receive reminders.',
        });
        return;
      }
      if (!result.ok) {
        toast.error(result.message || 'No devices subscribed yet.');
      } else {
        toast.success('Test reminder sent 🎉', { description: 'Check your notifications.' });
      }
    } catch (e) {
      console.error('[edit reminder] test push failed', e);
      toast.error('Could not send test notification');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!savingRef.current) onOpenChange(nextOpen); }}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <span className="text-2xl">{habit.emoji}</span>
            <span className="truncate">{habit.name}</span>
          </SheetTitle>
          <SheetDescription>
            Set a daily reminder time and send a test push to confirm it works.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5 pb-6">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/40">
            <div>
              <p className="text-body font-medium text-foreground flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" /> Daily reminder
              </p>
              <p className="text-caption text-muted-foreground mt-0.5">
                Push notification at your chosen time.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
          </div>

          <div>
            <label className="text-caption text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Reminder Time
            </label>
            <Input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              disabled={!enabled || saving}
              className={`bg-secondary border-border rounded-input h-12 ${timeInvalid || timeMissing ? 'border-destructive ring-1 ring-destructive/40' : ''} disabled:opacity-50`}
            />
            {timeInvalid && (
              <p className="text-[11px] text-destructive mt-1.5">Use a valid time in HH:MM format.</p>
            )}
            {timeMissing && (
              <p className="text-[11px] text-destructive mt-1.5">Pick a reminder time.</p>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={sendTest}
            disabled={testing || saving}
            className="w-full h-11"
          >
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Send test notification
          </Button>

          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          <Button
            type="button"
            onClick={() => { void save(); }}
            disabled={saving || timeInvalid || timeMissing}
            className="w-full h-12 gradient-primary text-white font-semibold"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save reminder
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
