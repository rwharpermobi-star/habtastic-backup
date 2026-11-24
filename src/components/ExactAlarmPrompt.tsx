import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  getExactAlarmStatus,
  openExactAlarmSettings,
  type ExactAlarmStatus,
} from '@/lib/exactAlarms';

/**
 * Android 12+ only: explains the "Alarms & reminders" switch and opens it.
 * Renders nothing on web/iOS, on older Android, or once it is allowed.
 */
export default function ExactAlarmPrompt({ show = true }: { show?: boolean }) {
  const [status, setStatus] = useState<ExactAlarmStatus>('unsupported');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await getExactAlarmStatus());
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const allow = async () => {
    setBusy(true);
    try {
      const next = await openExactAlarmSettings();
      setStatus(next);
      if (next === 'granted') toast.success('Reminders will now arrive right on time.');
      else toast('No problem: reminders still arrive, they may just be a few minutes late.');
    } finally {
      setBusy(false);
    }
  };

  if (!show || status !== 'denied') return null;

  return (
    <div
      className="rounded-btn bg-warning/10 border border-warning/30 p-3 mb-3"
      data-testid="exact-alarm-prompt"
    >
      <div className="flex gap-2 mb-2">
        <AlarmClock className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-caption font-semibold text-foreground">Get reminders right on time</p>
          <p className="text-caption text-muted-foreground">
            Android can delay reminders to save battery. Turn on
            {' '}<span className="font-semibold">Allow setting alarms and reminders</span>{' '}
            for HabTastic so each one arrives at the exact time you chose.
          </p>
        </div>
      </div>
      <Button size="sm" onClick={allow} disabled={busy} className="w-full">
        <Check className="w-4 h-4 mr-1" /> {busy ? 'Opening settings…' : 'Open Alarms & reminders'}
      </Button>
    </div>
  );
}
