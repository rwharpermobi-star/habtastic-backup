import { useState, useEffect, useMemo, useRef } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { Reorder, useDragControls, motion, AnimatePresence } from 'framer-motion';
import { useHabits, type DbHabit } from '@/hooks/useHabits';
import { HABIT_SAVE_ERRORS, isFreeHabitLimitError } from '@/lib/habitErrors';
import { pendingCompletion } from '@/lib/offlineOutbox';
import { usePremium } from '@/hooks/usePremium';
import { useHabitOrder } from '@/hooks/useHabitOrder';
import { usePersistedState } from '@/hooks/usePersistedState';
import HabitCard from '@/components/HabitCard';
import SwipeableHabit from '@/components/SwipeableHabit';
import FlyingRewardLayer, { flyReward } from '@/components/FlyingReward';
import AddHabitDialog from '@/components/AddHabitDialog';
import QuickAddHabitBar from '@/components/QuickAddHabitBar';
import Paywall from '@/components/Paywall';
import HabitVerificationDialog from '@/components/HabitVerificationDialog';
import EditReminderSheet from '@/components/EditReminderSheet';
import PerfectDayCelebration from '@/components/PerfectDayCelebration';
import EmptyState from '@/components/EmptyState';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Search,
  ChevronDown,
  Bell,
  BellOff,
  Copy,
  Trash2,
  Pencil,
  Archive,
  SlidersHorizontal,
  Sparkles,
  Lock,
} from 'lucide-react';
import { formatLocalDate, todayStr, XP_BY_DIFFICULTY } from '@/lib/habitStore';
import { toast } from 'sonner';
import { vibrateLight } from '@/lib/haptics';

type SortKey = 'custom' | 'time' | 'xp' | 'streak' | 'alpha' | 'priority';
type StatusFilter = 'all' | 'done' | 'todo';
type TimeFilter = 'all' | 'morning' | 'afternoon' | 'evening' | 'anytime';

const CATEGORIES = ['health', 'mindset', 'work', 'art', 'finance', 'custom'];

function isDueToday(h: DbHabit): boolean {
  if (h.frequency === 'custom') {
    const dow = new Date().getDay();
    return (h.custom_days || []).includes(dow);
  }
  return true;
}

function getStreak(completions: string[]): number {
  const today = new Date();
  let streak = 0;
  let started = false;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatLocalDate(d);
    if (completions.includes(ds)) { streak++; started = true; }
    else if (started || i > 0) break;
  }
  return streak;
}

function timeBucket(t?: string | null): TimeFilter {
  if (!t) return 'anytime';
  const [h] = t.split(':').map(Number);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function parseHHMM(t?: string | null): number {
  if (!t) return 9999;
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ---- Habit row (swipeable + optional drag handle) --------------------------

interface HabitRowProps {
  habit: DbHabit;
  index: number;
  reorderable: boolean;
  completed: boolean;
  onToggle: (h: DbHabit) => void;
  onCompleteSwipe: (h: DbHabit, rect: DOMRect) => void;
  onEdit: (h: DbHabit) => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (h: DbHabit) => Promise<void>;
  onToggleReminder: (h: DbHabit) => Promise<void>;
}

function HabitRow({
  habit, index, reorderable, completed,
  onToggle, onCompleteSwipe, onEdit, onDelete, onDuplicate, onToggleReminder,
}: HabitRowProps) {
  const xp = XP_BY_DIFFICULTY[habit.difficulty] ?? 10;
  const controls = useDragControls();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const runAction = async (action: () => Promise<void>) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        action(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('habit_save_timeout')), 15_000);
        }),
      ]);
    } catch (error) {
      console.error('[Habits] habit action failed', error);
      toast.error('Could not update habit. Please retry.');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      pendingRef.current = false;
      setPending(false);
    }
  };

  const inner = (
    <SwipeableHabit
      habitId={habit.id}
      completed={completed}
      showGrip={reorderable}
      onGripPointerDown={(e) => { vibrateLight(); controls.start(e); }}
      onComplete={(rect) => onCompleteSwipe(habit, rect)}
      onEdit={() => onEdit(habit)}
      onDuplicate={() => { void runAction(() => onDuplicate(habit)); }}
      onDelete={() => { void runAction(() => onDelete(habit.id)); }}
    >
      <div className={reorderable ? 'pl-5' : ''}>
        <HabitCard habit={habit} onToggle={() => onToggle(habit)} index={index} />
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-auto">
        <span className="text-caption font-semibold px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
          +{xp} XP
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={`Options for ${habit.name}`}
              className="p-1 rounded-btn hover:bg-secondary text-muted-foreground active:scale-90 transition-transform"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={pending} onClick={() => onEdit(habit)}>
              <Pencil className="w-4 h-4 mr-2" /> Edit reminder
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onClick={() => { void runAction(() => onToggleReminder(habit)); }}>
              {habit.reminder_enabled
                ? <><BellOff className="w-4 h-4 mr-2" /> Mute reminder</>
                : <><Bell className="w-4 h-4 mr-2" /> Enable reminder</>}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onClick={() => { void runAction(() => onDuplicate(habit)); }}>
              <Copy className="w-4 h-4 mr-2" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast('Archive coming soon')}>
              <Archive className="w-4 h-4 mr-2" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={pending}
              onClick={() => { void runAction(() => onDelete(habit.id)); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SwipeableHabit>
  );

  if (!reorderable) return inner;

  return (
    <Reorder.Item
      as="div"
      value={habit}
      dragListener={false}
      dragControls={controls}
      layout
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      whileDrag={{ scale: 1.03, boxShadow: '0 12px 32px -12px hsl(var(--primary) / 0.45)', zIndex: 5 }}
    >
      {inner}
    </Reorder.Item>
  );
}

// ---- Collapsible section with persisted state ------------------------------

interface SectionProps {
  storageKey: string;
  title: string;
  icon: string;
  items: DbHabit[];
  reorderable: boolean;
  onReorder: (sectionIds: string[], newIds: string[]) => void;
  defaultOpen?: boolean;
  emptyText?: string;
  rowRenderer: (h: DbHabit, i: number) => React.ReactNode;
}

function Section({
  storageKey, title, icon, items, reorderable, onReorder,
  defaultOpen = true, emptyText, rowRenderer,
}: SectionProps) {
  const [open, setOpen] = usePersistedState<boolean>(`habtastic.habits.section.${storageKey}`, defaultOpen);
  if (items.length === 0 && !emptyText) return null;

  const sectionIds = items.map(h => h.id);

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between mb-2 px-1 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg transition-transform group-active:scale-110" aria-hidden>{icon}</span>
          <h2 className="font-semibold text-body-lg text-foreground">{title}</h2>
          <motion.span
            key={items.length}
            initial={{ scale: 0.7, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="text-caption text-muted-foreground bg-secondary rounded-full px-2 py-0.5"
          >
            {items.length}
          </motion.span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {items.length === 0 ? (
              <p className="text-caption text-muted-foreground px-1 pb-2">{emptyText}</p>
            ) : reorderable ? (
              <Reorder.Group
                as="div"
                axis="y"
                values={items}
                onReorder={(newItems) => onReorder(sectionIds, newItems.map(i => i.id))}
                className="space-y-3"
              >
                {items.map((h, i) => rowRenderer(h, i))}
              </Reorder.Group>
            ) : (
              <div className="space-y-3">
                {items.map((h, i) => rowRenderer(h, i))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- Page ------------------------------------------------------------------

export default function Habits() {
  usePageMeta({
    title: 'Manage Your Habits — HabTastic AI',
    description: 'Create, schedule and edit your daily habits, reminders and routines inside HabTastic AI.',
    canonicalPath: '/habits',
  });

  const {
    habits,
    allHabits,
    lockedHabits,
    isHabitLocked,
    premiumProgressLocked,
    toggleCompletion,
    deleteHabit,
    addHabit,
    updateHabit,
  } = useHabits();
  const { canAddHabit, trialExpired } = usePremium();
  const { orderedHabits, reorderInSection } = useHabitOrder(allHabits);
  const [showPaywall, setShowPaywall] = useState(false);
  const createPendingRef = useRef<{ id?: string; startedAt: number } | null>(null);
  const duplicateIdsRef = useRef(new Map<string, string>());
  const [verifyingHabit, setVerifyingHabit] = useState<DbHabit | null>(null);
  const [editingReminder, setEditingReminder] = useState<DbHabit | null>(null);
  const today = todayStr();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [timeOfDay, setTimeOfDay] = useState<TimeFilter>('all');
  const [sortBy, setSortBy] = usePersistedState<SortKey>('habtastic.habits.sort', 'custom');
  const [showFilters, setShowFilters] = useState(false);

  // Permit retrying the SAME draft after a timed-out response, while retaining
  // the normal double-submit guard for other drafts and quick-create actions.
  const runCreate = async <T,>(id: string | undefined, action: () => Promise<T>): Promise<T> => {
    const pending = createPendingRef.current;
    const fresh = pending !== null && Date.now() - pending.startedAt < 15_000;
    if (fresh && (!id || pending.id !== id)) {
      throw new Error('Habit save already in progress');
    }
    const sameDraftRetry = fresh && !!id && pending.id === id;
    const token = { id, startedAt: Date.now() };
    if (!sameDraftRetry) createPendingRef.current = token;
    try {
      return await action();
    } finally {
      if (!sameDraftRetry && createPendingRef.current === token) {
        createPendingRef.current = null;
      }
    }
  };

  const handleAdd = async (habit: {
    id?: string;
    name: string; emoji: string; color: string; frequency: string;
    category: string; difficulty: string; reminderTime?: string;
    reminderEnabled?: boolean;
    customDays?: number[]; soundMode?: string;
    verificationEnabled?: boolean; verificationQuestion?: string | null;
  }) => {
    // Retryable drafts must reach the hook even when the first request
    // already filled the last free-tier slot but its response was lost.
    if (!habit.id && !canAddHabit(allHabits.length)) {
      setShowPaywall(true);
      throw new Error(HABIT_SAVE_ERRORS.FREE_LIMIT);
    }
    try {
      await runCreate(habit.id, () => addHabit({
      ...(habit.id ? { id: habit.id } : {}),
      name: habit.name,
      emoji: habit.emoji,
      color: habit.color,
      frequency: habit.frequency,
      category: habit.category,
      difficulty: habit.difficulty,
      reminder_time: habit.reminderTime || null,
      reminder_enabled: habit.reminderEnabled ?? !!habit.reminderTime,
      reminder_tone: 'normal',
      custom_days: habit.customDays || [],
      sound_mode: habit.soundMode || 'normal',
      verification_enabled: !!habit.verificationEnabled,
      verification_question: habit.verificationQuestion ?? null,
      }));
    } catch (error) {
      if (isFreeHabitLimitError(error)) {
        setShowPaywall(true);
        throw error;
      }
      if (error instanceof Error && error.message === HABIT_SAVE_ERRORS.SIGN_IN_REQUIRED) {
        throw error;
      }
      console.error('[Habits] habit creation failed', error);
      throw new Error('Could not save your habit. Please try again.');
    }
  };

  const handleToggle = async (habit: DbHabit) => {
    const justCompleted = await toggleCompletion(habit.id);
    if (justCompleted && habit.verification_enabled) setVerifyingHabit(habit);
  };

  const handleCompleteSwipe = async (habit: DbHabit, rect: DOMRect) => {
    if (habit.completions.includes(today)) return; // already done — no-op on swipe
    const completed = await toggleCompletion(habit.id);
    if (completed !== true) return; // Never animate an unsaved completion.
    // XP is server-owned. Don't show +XP for a completion still queued offline.
    if (!pendingCompletion(habit.user_id, habit.id, today)) {
      flyReward(rect, {
        xp: XP_BY_DIFFICULTY[habit.difficulty] ?? 10,
        coins: 0,
      });
    }
    if (habit.verification_enabled) setVerifyingHabit(habit);
  };

  const handleDuplicate = async (h: DbHabit) => {
    const newId = duplicateIdsRef.current.get(h.id) ?? crypto.randomUUID();
    duplicateIdsRef.current.set(h.id, newId);
    await runCreate(newId, async () => {
      try {
        await addHabit({
      id: newId,
      name: `${h.name} (copy)`,
      emoji: h.emoji,
      color: h.color,
      frequency: h.frequency,
      category: h.category,
      difficulty: h.difficulty,
      reminder_time: h.reminder_time,
      reminder_enabled: h.reminder_enabled,
      reminder_tone: h.reminder_tone,
      custom_days: h.custom_days || [],
      sound_mode: h.sound_mode,
      verification_enabled: !!h.verification_enabled,
      verification_question: h.verification_question ?? null,
        });
        duplicateIdsRef.current.delete(h.id);
        toast.success('Habit duplicated');
      } catch (error) {
        if (isFreeHabitLimitError(error)) setShowPaywall(true);
        throw error;
      }
    });
  };

  const handleDelete = async (id: string) => {
    await deleteHabit(id);
    toast.success('Habit deleted');
  };

  const handleToggleReminder = async (h: DbHabit) => {
    await updateHabit(h.id, { reminder_enabled: !h.reminder_enabled });
    toast(h.reminder_enabled ? 'Reminder muted' : 'Reminder enabled');
  };

  // Base list uses custom order; filter + optional sort
  const activeOrderedHabits = orderedHabits.filter(h => !isHabitLocked(h.id));
  const lockedOrderedHabits = orderedHabits.filter(h => isHabitLocked(h.id));

  const filtered = useMemo(() => {
    let list = activeOrderedHabits.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q) || h.category.toLowerCase().includes(q));
    }
    if (category !== 'all') list = list.filter(h => h.category === category);
    if (status !== 'all') {
      list = list.filter(h => status === 'done' ? h.completions.includes(today) : !h.completions.includes(today));
    }
    if (timeOfDay !== 'all') list = list.filter(h => timeBucket(h.reminder_time) === timeOfDay);

    if (sortBy !== 'custom') {
      const diffRank: Record<string, number> = { hard: 0, medium: 1, easy: 2 };
      list.sort((a, b) => {
        switch (sortBy) {
          case 'time': return parseHHMM(a.reminder_time) - parseHHMM(b.reminder_time);
          case 'xp': return (XP_BY_DIFFICULTY[b.difficulty] ?? 0) - (XP_BY_DIFFICULTY[a.difficulty] ?? 0);
          case 'streak': return getStreak(b.completions) - getStreak(a.completions);
          case 'alpha': return a.name.localeCompare(b.name);
          case 'priority': return (diffRank[a.difficulty] ?? 3) - (diffRank[b.difficulty] ?? 3);
        }
      });
    }
    return list;
  }, [activeOrderedHabits, query, category, status, timeOfDay, sortBy, today]);

  // Section split
  const now = nowMinutes();
  const dueToday = filtered.filter(isDueToday);
  const completedToday = dueToday.filter(h => h.completions.includes(today));
  const notDone = dueToday.filter(h => !h.completions.includes(today));
  const todaysHabits = notDone.filter(h => !h.reminder_time || parseHHMM(h.reminder_time) <= now);
  const upcoming = notDone.filter(h => h.reminder_time && parseHHMM(h.reminder_time) > now);
  const future = filtered.filter(h => !isDueToday(h));

  // Summary (all habits due today, not filtered)
  const allDueToday = habits.filter(isDueToday);
  const allDoneToday = allDueToday.filter(h => h.completions.includes(today));
  const remaining = allDueToday.length - allDoneToday.length;
  const pct = allDueToday.length ? Math.round((allDoneToday.length / allDueToday.length) * 100) : 0;
  const xpToday = allDoneToday.reduce((s, h) => s + (XP_BY_DIFFICULTY[h.difficulty] ?? 10), 0);
  const allComplete = allDueToday.length > 0 && remaining === 0;

  // Perfect Day celebration — fires once per day when the last habit is completed
  const [perfectDayOpen, setPerfectDayOpen] = useState(false);
  useEffect(() => {
    if (!allComplete) return;
    const key = `habtastic.perfectDay.${today}`;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
    // slight delay so the flying-XP animation finishes first
    const t = window.setTimeout(() => setPerfectDayOpen(true), 650);
    return () => window.clearTimeout(t);
  }, [allComplete, today]);

  const reorderable = sortBy === 'custom';

  const renderRow = (h: DbHabit, i: number) => (
    <HabitRow
      key={h.id}
      habit={h}
      index={i}
      reorderable={reorderable}
      completed={h.completions.includes(today)}
      onToggle={handleToggle}
      onCompleteSwipe={handleCompleteSwipe}
      onEdit={setEditingReminder}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
      onToggleReminder={handleToggleReminder}
    />
  );

  const renderLockedRow = (h: DbHabit, i: number) => (
    <div key={h.id} className="relative overflow-hidden rounded-card border border-primary/20">
      <div className="pointer-events-none select-none opacity-45 blur-[1px]">
        <HabitCard habit={h} onToggle={() => {}} index={i} />
      </div>
      <button
        type="button"
        onClick={() => setShowPaywall(true)}
        className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px] px-4 text-center"
        aria-label={`Unlock ${h.name} with Premium`}
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/90 px-3 py-2 text-xs font-semibold text-foreground shadow-card">
          <Lock className="w-3.5 h-3.5 text-primary" />
          Progress saved — Premium required to continue
        </span>
      </button>
    </div>
  );

  return (
    <>
      <FlyingRewardLayer />
      <PerfectDayCelebration
        open={perfectDayOpen}
        onClose={() => setPerfectDayOpen(false)}
        count={allDoneToday.length}
      />

      <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-h1 text-foreground">My Habits</h1>
          <AddHabitDialog onAdd={handleAdd} habitCount={habits.length} />
        </div>

        {/* Progress summary */}
        {habits.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="glass rounded-card p-4 mb-4 shadow-card"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-caption text-muted-foreground">Today's Progress</p>
                <p className="font-bold text-h2 text-foreground">
                  {allDoneToday.length}<span className="text-muted-foreground text-body-lg">/{allDueToday.length}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-caption text-muted-foreground">Completion</p>
                <p className="font-bold text-h2 text-primary">{pct}%</p>
              </div>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full gradient-primary"
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="flex items-center gap-3 mt-3 text-caption text-muted-foreground">
              <span>⏳ {remaining} left</span>
              <span
                id="habits-xp-target"
                className="inline-flex items-center gap-1 text-primary font-semibold px-1.5 py-0.5 rounded-full bg-primary/10"
              >
                ⭐ +{xpToday} XP
              </span>
            </div>
          </motion.div>
        )}

        <QuickAddHabitBar onAdd={handleAdd} disabled={!canAddHabit(habits.length)} />

        {habits.length > 0 && (
          <>
            {/* Search + filter toggle */}
            <div className="flex items-center gap-2 mt-4 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search habits…"
                  className="pl-9 h-10 rounded-btn"
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.92 }}
                aria-label="Toggle filters"
                onClick={() => setShowFilters(v => !v)}
                className={`h-10 w-10 rounded-btn flex items-center justify-center transition-colors ${
                  showFilters ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
              </motion.button>
            </div>

            <AnimatePresence initial={false}>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="glass rounded-card p-3 mb-4 space-y-3">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {['all', ...CATEGORIES].map(c => (
                        <motion.button
                          key={c}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setCategory(c)}
                          className={`text-caption capitalize px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                            category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                          }`}
                        >{c}</motion.button>
                      ))}
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {(['all', 'todo', 'done'] as StatusFilter[]).map(s => (
                        <motion.button
                          key={s}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setStatus(s)}
                          className={`text-caption capitalize px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                            status === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                          }`}
                        >{s === 'todo' ? 'To do' : s}</motion.button>
                      ))}
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {(['all', 'morning', 'afternoon', 'evening', 'anytime'] as TimeFilter[]).map(t => (
                        <motion.button
                          key={t}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setTimeOfDay(t)}
                          className={`text-caption capitalize px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                            timeOfDay === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                          }`}
                        >{t}</motion.button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      <span className="text-caption text-muted-foreground shrink-0">Sort:</span>
                      {(['custom', 'time', 'priority', 'xp', 'streak', 'alpha'] as SortKey[]).map(s => (
                        <motion.button
                          key={s}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => setSortBy(s)}
                          className={`text-caption capitalize px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                            sortBy === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                          }`}
                        >{s === 'alpha' ? 'A–Z' : s === 'custom' ? 'Manual' : s}</motion.button>
                      ))}
                    </div>
                    {reorderable && (
                      <p className="text-[10px] text-muted-foreground px-1">
                        Tip: grab the handle on the left of a habit to reorder.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Empty state */}
        {habits.length === 0 ? (
          <EmptyState
            illustration="🦁"
            title="Let's build your first habit!"
            message="Start your journey — I'm right here to cheer you on every step of the way."
            actionsSlot={<AddHabitDialog onAdd={handleAdd} habitCount={habits.length} />}
          />
        ) : (


          <>
            <AnimatePresence>
              {allComplete && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  className="glass rounded-card p-6 text-center shadow-card mb-5 border border-primary/30"
                >
                  <p className="text-4xl mb-2 animate-bounce" aria-hidden>🎉</p>
                  <p className="font-bold text-body-lg text-foreground">Amazing work!</p>
                  <p className="text-body text-muted-foreground">You've completed all your habits today.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <Section
              storageKey="today"
              title="Today's Habits"
              icon="🔥"
              items={todaysHabits}
              reorderable={reorderable}
              onReorder={reorderInSection}
              defaultOpen
              emptyText="Nothing due right now — you're ahead of schedule."
              rowRenderer={renderRow}
            />

            <Section
              storageKey="upcoming"
              title="Upcoming"
              icon="⏳"
              items={upcoming}
              reorderable={reorderable}
              onReorder={reorderInSection}
              defaultOpen
              rowRenderer={renderRow}
            />

            <Section
              storageKey="completed"
              title="Completed Today"
              icon="✅"
              items={completedToday}
              reorderable={reorderable}
              onReorder={reorderInSection}
              defaultOpen={false}
              rowRenderer={renderRow}
            />

            <Section
              storageKey="future"
              title="Future Habits"
              icon="📅"
              items={future}
              reorderable={reorderable}
              onReorder={reorderInSection}
              defaultOpen={false}
              rowRenderer={renderRow}
            />

            {filtered.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-60" />
                <p className="text-body">No habits match your filters.</p>
              </div>
            )}
          </>
        )}

        {lockedHabits.length > 0 && (
          <div className="mb-5 rounded-card border border-primary/30 bg-primary/5 p-4 shadow-card">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-primary/15 p-2">
                <Lock className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">
                  {trialExpired ? 'Your Premium trial ended' : 'Premium access is locked'}
                </p>
                <p className="mt-1 text-caption text-muted-foreground">
                  Nothing was deleted. Your extra habits and their history are saved exactly as you left them.
                  Upgrade to Premium and they unlock immediately.
                </p>
                <button
                  type="button"
                  onClick={() => setShowPaywall(true)}
                  className="mt-2 text-xs font-semibold text-primary hover:underline"
                >
                  Unlock saved progress
                </button>
              </div>
            </div>
          </div>
        )}

        {lockedOrderedHabits.length > 0 && (
          <Section
            storageKey="locked-premium"
            title="Saved Premium Habits"
            icon="🔒"
            items={lockedOrderedHabits}
            reorderable={false}
            onReorder={() => {}}
            defaultOpen
            rowRenderer={renderLockedRow}
          />
        )}
      </div>

      <EditReminderSheet
        habit={editingReminder}
        open={!!editingReminder}
        onOpenChange={(o) => { if (!o) setEditingReminder(null); }}
        onSave={updateHabit}
      />
      <Paywall
        open={showPaywall}
        onOpenChange={setShowPaywall}
        trigger={premiumProgressLocked ? "trial_expired" : "habits"}
      />
      {verifyingHabit && (
        <HabitVerificationDialog
          open={!!verifyingHabit}
          onOpenChange={(o) => { if (!o) setVerifyingHabit(null); }}
          habitId={verifyingHabit.id}
          habitName={verifyingHabit.name}
          habitEmoji={verifyingHabit.emoji}
          habitCategory={verifyingHabit.category}
          customQuestion={verifyingHabit.verification_question}
          completedDate={today}
        />
      )}
    </>
  );
}
