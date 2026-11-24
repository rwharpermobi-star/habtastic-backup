import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, Clock, Bell, Volume2, Siren, Sparkles, Send, Loader2 } from 'lucide-react';
import { getHabitColor } from '@/lib/habitStore';
import { HABIT_SAVE_ERRORS } from '@/lib/habitErrors';
import { toast } from 'sonner';
import { toast as sonner } from 'sonner';
import { getDefaultHardSoundMode, type SoundMode } from '@/lib/habitSoundPrefs';
import { sendHabitTestPush } from '@/lib/webPush';

const FREQ_OPTIONS = ['daily', 'weekly', 'custom'] as const;

const CATEGORY_OPTIONS = [
  { value: 'health' as const, label: 'Health', emoji: '❤️' },
  { value: 'mindset' as const, label: 'Mindset', emoji: '🧠' },
  { value: 'work' as const, label: 'Work', emoji: '💼' },
  { value: 'art' as const, label: 'Art', emoji: '🎨' },
  { value: 'finance' as const, label: 'Finance', emoji: '💰' },
  { value: 'custom' as const, label: 'Custom', emoji: '⭐' },
];

interface Template { name: string; emoji: string }

const TEMPLATES: Record<string, Template[]> = {
  health: [
    { name: 'Exercise', emoji: '💪' },
    { name: 'Running', emoji: '🏃' },
    { name: 'Drink Water', emoji: '💧' },
    { name: 'Healthy Nutrition', emoji: '🥗' },
  ],
  mindset: [
    { name: 'Meditation', emoji: '🧘' },
    { name: 'Reading', emoji: '📖' },
    { name: 'Learning', emoji: '🧠' },
    { name: 'Sleep Early', emoji: '😴' },
  ],
  work: [
    { name: 'Deep Work', emoji: '💼' },
    { name: 'Daily Planning', emoji: '📝' },
    { name: 'Productivity', emoji: '📊' },
  ],
  art: [
    { name: 'Drawing', emoji: '🎨' },
    { name: 'Music Practice', emoji: '🎸' },
    { name: 'Creating', emoji: '🎬' },
    { name: 'Writing', emoji: '✍️' },
  ],
  finance: [
    { name: 'Track Expenses', emoji: '🧾' },
    { name: 'Save Money', emoji: '🏦' },
    { name: 'Budget Review', emoji: '📊' },
    { name: 'Invest', emoji: '📈' },
    { name: 'No-Spend Day', emoji: '🚫' },
    { name: 'Pay Off Debt', emoji: '💳' },
  ],
};

const CUSTOM_ICONS = [
  '⭐', '🎯', '🌅', '🔥', '🚀', '💎', '🌱', '⚡', '🏆', '🧩',
  '💪', '🧘', '📖', '🎨', '🎸', '✍️', '💧', '🥗', '😴', '📝',
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', meta: '+5 XP · 1 reminder', activeClass: 'bg-[#A3FF12]/15 text-[#A3FF12] ring-1 ring-[#A3FF12]/30' },
  { value: 'medium' as const, label: 'Medium', meta: '+10 XP · 2 reminders', activeClass: 'bg-warning/15 text-warning ring-1 ring-warning/30' },
  { value: 'hard' as const, label: 'Hard', meta: '+20 XP · 3 urgent', activeClass: 'bg-destructive/15 text-destructive ring-1 ring-destructive/30' },
];

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' },
  { v: 4, l: 'Thu' }, { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];

interface AddHabitDialogProps {
  onAdd: (habit) => Promise<unknown>;
  habitCount: number;
}

type Category = 'health' | 'mindset' | 'work' | 'art' | 'finance' | 'custom';
type Frequency = 'daily' | 'weekly' | 'custom';

export default function AddHabitDialog({ onAdd, habitCount }: AddHabitDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>('health');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [customName, setCustomName] = useState('');
  const [customEmoji, setCustomEmoji] = useState('⭐');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [testingPush, setTestingPush] = useState(false);
  const [soundMode, setSoundMode] = useState<SoundMode>('normal');
  const [verificationEnabled, setVerificationEnabled] = useState(false);
  const [verificationQuestion, setVerificationQuestion] = useState('');
  const [errors, setErrors] = useState<{ name?: string; days?: string; time?: string }>({});

  const isCustom = category === 'custom';

  // Validation derived state
  const trimmedName = customName.trim();
  const nameInvalid = isCustom && trimmedName.length === 0;
  const nameTooShort = isCustom && trimmedName.length > 0 && trimmedName.length < 2;
  const daysInvalid = frequency === 'custom' && customDays.length === 0;
  const timeInvalid = !!reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime);
  const templateInvalid = !isCustom && selectedTemplate === null;

  const canSubmit = !nameInvalid && !nameTooShort && !daysInvalid && !timeInvalid && !templateInvalid;

  // Reset template when switching categories
  useEffect(() => { setSelectedTemplate(null); setErrors({}); }, [category]);

  // Clear field-level errors as user fixes them
  useEffect(() => {
    setErrors((prev) => {
      const next = { ...prev };
      if (!nameInvalid && !nameTooShort) delete next.name;
      if (!daysInvalid) delete next.days;
      if (!timeInvalid) delete next.time;
      return next;
    });
  }, [nameInvalid, nameTooShort, daysInvalid, timeInvalid]);

  // Default to user's preferred siren preference when difficulty becomes 'hard'
  useEffect(() => {
    if (difficulty === 'hard') setSoundMode(getDefaultHardSoundMode());
    else setSoundMode('normal');
  }, [difficulty]);

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      toast('Notifications blocked', {
        description: 'Enable notifications in your browser settings to stay on track.',
      });
      return false;
    }
    const result = await Notification.requestPermission();
    return result === 'granted';
  };

  const reset = () => {
    draftIdRef.current = null;
    setCategory('health');
    setSelectedTemplate(null);
    setCustomName('');
    setCustomEmoji('⭐');
    setFrequency('daily');
    setCustomDays([]);
    setDifficulty('medium');
    setReminderTime('09:00');
    setReminderEnabled(true);
    setSoundMode('normal');
    setVerificationEnabled(false);
    setVerificationQuestion('');
  };

  const sendTestPush = async () => {
    if (testingPush) return;
    setTestingPush(true);
    try {
      const previewName = customName.trim() || selectedTemplate?.name || 'Your habit';
      const previewEmoji = isCustom ? customEmoji : (selectedTemplate?.emoji ?? '⭐');
      const result = await sendHabitTestPush(previewName, previewEmoji);
      if (result.needsPermission) {
        sonner.error('Enable notifications first', {
          description: 'Allow notifications in your browser to receive habit reminders.',
        });
        return;
      }
      if (!result.ok) {
        sonner.error(result.message || 'No devices subscribed yet.');
      } else {
        sonner.success('Test reminder sent 🎉', { description: 'Check your notifications.' });
      }
    } catch (e) {
      console.error('[test push] failed', e);
      sonner.error('Could not send test notification');
    } finally {
      setTestingPush(false);
    }
  };

  const handleSubmit = async () => {
    if (savingRef.current) return;
    setSaveError(null);
    const newErrors: typeof errors = {};
    let name = '';
    let emoji = '⭐';
    if (isCustom) {
      if (!trimmedName) newErrors.name = 'Give your habit a name.';
      else if (trimmedName.length < 2) newErrors.name = 'Name needs at least 2 characters.';
      else { name = trimmedName; emoji = customEmoji; }
    } else if (selectedTemplate) {
      name = selectedTemplate.name;
      emoji = selectedTemplate.emoji;
    } else {
      // No template selected — toast and bail
      toast('Pick a habit', { description: 'Choose a template or switch to Custom.' });
      return;
    }

    let resolvedCustomDays: number[] = [];
    if (frequency === 'weekly') resolvedCustomDays = [0, 1, 2, 3, 4, 5, 6];
    else if (frequency === 'custom') {
      if (customDays.length === 0) newErrors.days = 'Pick at least one day for this habit.';
      else resolvedCustomDays = customDays;
    }

    if (reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderTime)) {
      newErrors.time = 'Use a valid time in HH:MM format.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Keep the same ID for this draft across all retries, including timeouts.
    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    const draftId = draftIdRef.current;
    savingRef.current = true;
    setSaving(true);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // The habit must be saved before asking for notification permission.
      // Only the database write participates in the save timeout.
      const savePromise = onAdd({
        id: draftId,
        name,
        emoji,
        color: getHabitColor(habitCount),
        frequency,
        category,
        difficulty,
        reminderTime: reminderEnabled && reminderTime ? reminderTime : undefined,
        reminderEnabled,
        customDays: resolvedCustomDays,
        soundMode,
        verificationEnabled,
        verificationQuestion: verificationEnabled ? verificationQuestion.trim() || null : null,
        createdAt: new Date().toISOString(),
        completions: [],
      });
      await Promise.race([
        savePromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(HABIT_SAVE_ERRORS.TIMEOUT)), 15_000);
        }),
      ]);
      reset();
      setOpen(false);
      // Best-effort notification permission after a successful save. Never
      // await this request or let its failure change the save result.
      if (reminderEnabled && reminderTime) {
        void requestNotificationPermission().catch((permissionError) => {
          console.error('[AddHabitDialog] notification permission failed', permissionError);
        });
      }
    } catch (error) {
      console.error('[AddHabitDialog] habit save failed', error);
      const code = error instanceof Error ? error.message : '';
      const readableMessage = code === HABIT_SAVE_ERRORS.TIMEOUT
        ? 'Taking too long. Check your connection and tap Save again.'
        : code === HABIT_SAVE_ERRORS.FREE_LIMIT
          ? 'Your free habit limit has been reached. Upgrade to save this habit; your draft is still here.'
          : code === HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED
            ? 'Please sign in to save this habit. Your draft is still here.'
            : typeof navigator !== 'undefined' && !navigator.onLine
              ? 'You are offline. Reconnect and tap Save again. Your draft is still here.'
              : 'Could not save your habit. Please try again. Your draft is still here.';
      setSaveError(readableMessage);
      toast.error(readableMessage);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleDay = (d: number) => {
    setCustomDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const templates = isCustom ? [] : (TEMPLATES[category] || []);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (savingRef.current) return; setOpen(v); if (!v) { reset(); setSaveError(null); } }}>
      <DialogTrigger asChild>
        <Button className="gradient-primary text-white font-semibold gap-2 rounded-btn px-5 h-11 active:scale-[0.98] transition-transform glow-primary">
          <Plus className="w-5 h-5" /> Start a Habit 🎯
        </Button>
      </DialogTrigger>
      <DialogContent aria-busy={saving} className={`glass border-border rounded-card max-w-sm mx-auto max-h-[85vh] overflow-y-auto shadow-card ${saving ? 'pointer-events-none' : ''}`} >
        <DialogHeader>
          <DialogTitle className="text-h3 font-display">Start a Winning Habit 💥</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Category */}
          <div>
            <label className="text-caption text-muted-foreground mb-2 block">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`py-2.5 rounded-btn text-[11px] font-semibold transition-all flex flex-col items-center gap-1 ${category === c.value ? 'gradient-primary text-white' : 'bg-secondary text-secondary-foreground'}`}
                >
                  <span className="text-base">{c.emoji}</span><span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Templates (non-custom) */}
          {!isCustom && (
            <div>
              <label className="text-caption text-muted-foreground mb-2 block">Pick a habit</label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map(t => {
                  const active = selectedTemplate?.name === t.name;
                  return (
                    <button
                      key={t.name}
                      onClick={() => setSelectedTemplate(t)}
                      className={`flex items-center gap-2 px-3 py-3 rounded-btn text-body font-semibold transition-all ${active ? 'gradient-primary text-white scale-[1.02]' : 'bg-secondary text-secondary-foreground'}`}
                    >
                      <span className="text-lg">{t.emoji}</span>
                      <span className="truncate">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom name + icon (only when Custom selected) */}
          {isCustom && (
            <>
              <div>
                <label htmlFor="habit-name" className="text-caption text-muted-foreground mb-2 block">Habit Name</label>
                <Input
                  id="habit-name"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g. Cold shower"
                  className={`bg-secondary border-border rounded-input h-12 font-medium ${errors.name ? 'border-destructive ring-1 ring-destructive/40' : ''}`}
                  maxLength={50}
                  autoFocus
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'habit-name-error' : undefined}
                />
                {errors.name && (
                  <p id="habit-name-error" role="alert" className="text-[11px] text-destructive mt-1.5">
                    {errors.name}
                  </p>
                )}
              </div>
              <div>
                <label className="text-caption text-muted-foreground mb-2 block">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_ICONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setCustomEmoji(e)}
                      className={`w-10 h-10 rounded-btn text-lg flex items-center justify-center transition-all ${customEmoji === e ? 'gradient-primary scale-110 ring-2 ring-primary/40' : 'bg-secondary hover:bg-secondary/80'}`}
                    >{e}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Frequency */}
          <div>
            <label className="text-caption text-muted-foreground mb-2 block">Frequency</label>
            <div className="flex gap-2">
              {FREQ_OPTIONS.map(f => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-2.5 rounded-btn text-body font-semibold capitalize transition-all ${frequency === f ? 'gradient-primary text-white' : 'bg-secondary text-secondary-foreground'}`}
                >{f}</button>
              ))}
            </div>
            {frequency === 'weekly' && (
              <p className="text-[11px] text-muted-foreground mt-2">✓ Tracked every day Mon–Sun.</p>
            )}
            {frequency === 'custom' && (
              <>
                <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label="Days of week">
                  {DAYS.map(d => {
                    const active = customDays.includes(d.v);
                    return (
                      <button
                        key={d.v}
                        onClick={() => toggleDay(d.v)}
                        aria-pressed={active}
                        className={`py-2 rounded-btn text-[11px] font-bold transition-all ${active ? 'gradient-primary text-white scale-105' : 'bg-secondary text-secondary-foreground'} ${errors.days ? 'ring-1 ring-destructive/40' : ''}`}
                      >{d.l}</button>
                    );
                  })}
                </div>
                {errors.days && (
                  <p role="alert" className="text-[11px] text-destructive mt-2">{errors.days}</p>
                )}
              </>
            )}
          </div>

          {/* Difficulty */}
          <div>
            <label className="text-caption text-muted-foreground mb-2 block">Difficulty</label>
            <div className="flex gap-2">
              {DIFFICULTY_OPTIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 py-2 rounded-btn text-caption font-semibold capitalize transition-all flex flex-col items-center gap-0.5 ${difficulty === d.value ? d.activeClass : 'bg-secondary text-secondary-foreground'}`}
                >
                  <span>{d.label}</span>
                  <span className="text-[10px] opacity-80 normal-case font-medium">{d.meta}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reminder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-caption text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Daily Reminder
              </label>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={setReminderEnabled}
                aria-label="Enable daily reminder"
              />
            </div>
            <Input
              type="time"
              value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
              disabled={!reminderEnabled}
              className={`bg-secondary border-border rounded-input h-12 ${errors.time ? 'border-destructive ring-1 ring-destructive/40' : ''} disabled:opacity-50`}
              aria-invalid={!!errors.time}
              aria-describedby={errors.time ? 'reminder-time-error' : undefined}
            />
            {errors.time && (
              <p id="reminder-time-error" role="alert" className="text-[11px] text-destructive mt-1.5">
                {errors.time}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sendTestPush}
              disabled={testingPush}
              className="mt-2 w-full h-9 text-caption"
            >
              {testingPush ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              Send test notification
            </Button>
            {!errors.time && reminderEnabled && typeof Notification !== 'undefined' && Notification.permission !== 'granted' && reminderTime && (
              <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                <Bell className="w-3 h-3 mt-0.5" />
                Enable notifications when you save to stay on track.
              </p>
            )}
          </div>

          {/* Sound mode (per-habit) */}
          <div>
            <label className="text-caption text-muted-foreground mb-2 block flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Reminder Sound
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setSoundMode('normal')}
                className={`flex-1 py-2.5 rounded-btn text-body font-semibold transition-all flex items-center justify-center gap-1.5 ${soundMode === 'normal' ? 'gradient-primary text-white' : 'bg-secondary text-secondary-foreground'}`}
              >
                <Volume2 className="w-4 h-4" /> Normal
              </button>
              <button
                onClick={() => setSoundMode('siren')}
                className={`flex-1 py-2.5 rounded-btn text-body font-semibold transition-all flex items-center justify-center gap-1.5 ${soundMode === 'siren' ? 'bg-destructive text-white' : 'bg-secondary text-secondary-foreground'}`}
              >
                <Siren className="w-4 h-4" /> Siren
              </button>
            </div>
            {difficulty !== 'hard' && soundMode === 'siren' && (
              <p className="text-[11px] text-muted-foreground mt-2">Siren is loudest — best paired with Hard habits.</p>
            )}
            {difficulty === 'hard' && soundMode === 'normal' && (
              <p className="text-[11px] text-muted-foreground mt-2">Tip: Siren mode helps you never miss a Hard habit.</p>
            )}
          </div>

          {/* Winston Verification (per-habit opt-in) */}
          <div>
            <label className="text-caption text-muted-foreground mb-2 block flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Winston Verification
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setVerificationEnabled(false)}
                className={`flex-1 py-2.5 rounded-btn text-body font-semibold transition-all ${!verificationEnabled ? 'gradient-primary text-white' : 'bg-secondary text-secondary-foreground'}`}
              >Off</button>
              <button
                type="button"
                onClick={() => setVerificationEnabled(true)}
                className={`flex-1 py-2.5 rounded-btn text-body font-semibold transition-all ${verificationEnabled ? 'gradient-primary text-white' : 'bg-secondary text-secondary-foreground'}`}
              >On · +25 XP</button>
            </div>
            {verificationEnabled && (
              <>
                <Input
                  value={verificationQuestion}
                  onChange={e => setVerificationQuestion(e.target.value)}
                  placeholder="Optional custom question for Winston"
                  maxLength={140}
                  className="bg-secondary border-border rounded-input h-11"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Winston will ask after each completion. Earn +25 XP and +5 🪙 with any answer.
                </p>
              </>
            )}
          </div>

          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="w-full gradient-primary text-white font-semibold h-12 rounded-btn active:scale-[0.98] transition-transform glow-primary font-display"
          >{saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : 'Crush It 💥'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
