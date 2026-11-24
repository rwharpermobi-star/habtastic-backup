import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useHabits } from '@/hooks/useHabits';
import { supabase } from '@/integrations/supabase/client';
import { logInfo, logError } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Check, Sparkles, Brain, Fingerprint, Droplets, Wind, BedDouble, Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { vibrateHeavy, vibrateMedium, vibrateLight } from '@/lib/haptics';
import { playLevelUp, playXPEarned } from '@/lib/sfx';
import { useTheme } from '@/contexts/ThemeContext';
import ThemePreviewCard from '@/components/ThemePreviewCard';
import logo from '@/assets/logo-sm.webp';

// ─── Scoring System ───
interface Scores {
  energy: number;
  focus: number;
  discipline: number;
  emotional: number;
  structure: number;
}

const INITIAL_SCORES: Scores = { energy: 50, focus: 50, discipline: 50, emotional: 50, structure: 50 };

// ─── Question Data ───
interface Question {
  id: string;
  emoji: string;
  question: string;
  options: { label: string; emoji: string; scores: Partial<Scores> }[];
}

const QUESTIONS: Question[] = [
  {
    id: 'sleep',
    emoji: '👋',
    question: "Hello! We'd love to know more about you. How many hours do you typically sleep at night?",
    options: [
      { label: 'Less than 6 hours', emoji: '😫', scores: { energy: -15, emotional: -10 } },
      { label: '6–8 hours', emoji: '😊', scores: { energy: 5 } },
      { label: '8–10 hours', emoji: '😀', scores: { energy: 15, focus: 5 } },
      { label: 'More than 10 hours', emoji: '😃', scores: { energy: 10, discipline: -5 } },
    ],
  },
  {
    id: 'wake_up',
    emoji: '⏰',
    question: 'How much time do you usually take to get out of bed?',
    options: [
      { label: '0–10 minutes', emoji: '🕐', scores: { discipline: 15, energy: 10 } },
      { label: '10–20 minutes', emoji: '🕑', scores: { discipline: 5 } },
      { label: '20–30 minutes', emoji: '🕓', scores: { discipline: -5, energy: -5 } },
      { label: 'More than 30 minutes', emoji: '🕔', scores: { discipline: -15, energy: -10 } },
    ],
  },
  {
    id: 'energy',
    emoji: '🌻',
    question: 'How do you feel about your energy levels throughout the day?',
    options: [
      { label: 'High energy throughout the day', emoji: '🌻', scores: { energy: 20, focus: 10 } },
      { label: 'Medium - My energy decreases as the day goes on', emoji: '🌾', scores: { energy: 0 } },
      { label: 'Low - I need support to increase my energy', emoji: '🥀', scores: { energy: -15, emotional: -5 } },
    ],
  },
  {
    id: 'goals_vision',
    emoji: '🔮',
    question: 'How do you envision yourself living a better life?',
    options: [
      { label: 'I want to become more productive', emoji: '⏳', scores: { structure: 10, discipline: 5 } },
      { label: 'I want to become more active', emoji: '💡', scores: { energy: 10 } },
      { label: 'I want to become more disciplined', emoji: '📌', scores: { discipline: 10 } },
      { label: 'I want to practice more mindfulness', emoji: '🧠', scores: { emotional: 15, focus: 5 } },
    ],
  },
  {
    id: 'blocker',
    emoji: '🔒',
    question: 'What motivated you to become more organized?',
    options: [
      { label: 'Lack of motivation', emoji: '🔋', scores: { discipline: -10, emotional: -5 } },
      { label: 'No daily plan', emoji: '📝', scores: { structure: -15 } },
      { label: 'Not enough time', emoji: '⏱️', scores: { structure: -10, energy: -5 } },
      { label: "There's nothing holding me back", emoji: '🔥', scores: { discipline: 15, energy: 10, emotional: 10 } },
    ],
  },
  {
    id: 'clarity',
    emoji: '🧭',
    question: 'How clear do you feel about your life direction?',
    options: [
      { label: 'Very clear', emoji: '🎯', scores: { focus: 15, emotional: 10, structure: 10 } },
      { label: 'Somewhat clear', emoji: '🤔', scores: { focus: 0 } },
      { label: 'I feel lost', emoji: '😶‍🌫️', scores: { focus: -15, emotional: -15, structure: -10 } },
    ],
  },
  {
    id: 'time_control',
    emoji: '⏳',
    question: 'How in control do you feel of your daily time?',
    options: [
      { label: 'Fully in control', emoji: '👑', scores: { structure: 15, discipline: 10 } },
      { label: 'Sometimes overwhelmed', emoji: '😅', scores: { structure: -5, emotional: -5 } },
      { label: 'I feel like my day controls me', emoji: '🌊', scores: { structure: -15, discipline: -10, emotional: -10 } },
    ],
  },
  {
    id: 'consistency',
    emoji: '🔥',
    question: 'How consistent are you with things you start?',
    options: [
      { label: 'Very consistent', emoji: '💎', scores: { discipline: 20 } },
      { label: 'I struggle sometimes', emoji: '😬', scores: { discipline: -5 } },
      { label: 'I often quit', emoji: '💨', scores: { discipline: -20, emotional: -5 } },
    ],
  },
  {
    id: 'stress',
    emoji: '🧠',
    question: 'How often do you feel overwhelmed?',
    options: [
      { label: 'Rarely', emoji: '😌', scores: { emotional: 15, focus: 10 } },
      { label: 'A few times a week', emoji: '😰', scores: { emotional: -5 } },
      { label: 'Almost every day', emoji: '🤯', scores: { emotional: -20, energy: -10 } },
    ],
  },
  {
    id: 'distraction',
    emoji: '👀',
    question: 'How easily are you distracted?',
    options: [
      { label: 'Easily distracted', emoji: '👀', scores: { focus: -20, discipline: -5 } },
      { label: 'I occasionally lose focus', emoji: '🎯', scores: { focus: -5 } },
      { label: 'I rarely lose focus', emoji: '😵', scores: { focus: 10 } },
      { label: 'I usually manage to stay focused', emoji: '🧐', scores: { focus: 15, discipline: 5 } },
    ],
  },
];

// ─── Suggested Habits ───
const SUGGESTED_HABITS = [
  { emoji: '🏃', name: 'Morning Exercise', category: 'health' as const, difficulty: 'medium' as const },
  { emoji: '🧘', name: 'Meditate 10min', category: 'mindset' as const, difficulty: 'easy' as const },
  { emoji: '📚', name: 'Read 20min', category: 'mindset' as const, difficulty: 'easy' as const },
  { emoji: '💧', name: 'Drink 8 Glasses', category: 'health' as const, difficulty: 'easy' as const },
  { emoji: '✍️', name: 'Journal', category: 'mindset' as const, difficulty: 'easy' as const },
  { emoji: '🥗', name: 'Eat Clean', category: 'health' as const, difficulty: 'medium' as const },
  { emoji: '🎨', name: 'Create Art', category: 'mindset' as const, difficulty: 'easy' as const },
  { emoji: '💰', name: 'Financial Wellness', category: 'mindset' as const, difficulty: 'medium' as const },
];

function getScoreLabel(val: number): { label: string; color: string } {
  if (val >= 65) return { label: 'Strong 💪', color: 'text-green-600 dark:text-green-400' };
  if (val >= 45) return { label: 'Moderate ⚡', color: 'text-yellow-600 dark:text-yellow-400' };
  if (val >= 30) return { label: 'Needs Improvement 🔥', color: 'text-orange-600 dark:text-orange-400' };
  return { label: 'Weak — Needs Support 🚨', color: 'text-red-600 dark:text-red-400' };
}

function getUserTags(scores: Scores): string[] {
  const tags: string[] = [];
  if (scores.discipline < 35) tags.push('Low Discipline');
  if (scores.energy < 35) tags.push('Low Energy');
  if (scores.emotional < 35) tags.push('Burnout Risk');
  if (scores.focus < 35) tags.push('Easily Distracted');
  if (scores.structure < 35) tags.push('Needs Structure');
  if (scores.discipline >= 60 && scores.energy >= 60) tags.push('High Potential');
  if (tags.length === 0) tags.push('Balanced');
  return tags;
}

function getPersonalizedMessage(scores: Scores): string {
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  const strongest = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const nameMap: Record<string, string> = {
    energy: 'energy', focus: 'focus', discipline: 'discipline',
    emotional: 'emotional balance', structure: 'daily structure',
  };
  if (weakest[1] >= 55) {
    return "You're in a strong position! With the right system, you'll reach your next level fast. 🚀";
  }
  return `You have strong ${nameMap[strongest[0]]}, but ${nameMap[weakest[0]]} is holding you back. With the right system, you can transform fast. ✨`;
}

function getPlanItems(scores: Scores): string[] {
  const items: string[] = [];
  if (scores.structure < 50) items.push('Build a simple daily routine');
  if (scores.energy < 50) items.push('Improve morning energy');
  if (scores.focus < 50) items.push('Reduce distractions');
  if (scores.discipline < 50) items.push('Strengthen consistency');
  if (scores.emotional < 50) items.push('Add mindfulness breaks');
  if (items.length < 3) {
    items.push('Level up your productivity');
    items.push('Track your progress daily');
  }
  return items.slice(0, 5);
}

// ─── Phase Constants ───
const PHASE_WELCOME = 0;
const PHASE_THEME = 1;
const PHASE_QUESTIONS_START = 2;
const PHASE_QUESTIONS_END = PHASE_QUESTIONS_START + QUESTIONS.length - 1;
const PHASE_ANALYSIS = PHASE_QUESTIONS_END + 1;
const PHASE_RESULTS = PHASE_ANALYSIS + 1;
const PHASE_PLAN = PHASE_RESULTS + 1;
const PHASE_HABITS = PHASE_PLAN + 1;
const PHASE_COMMITMENT = PHASE_HABITS + 1;
const PHASE_FIRST_ACTION = PHASE_COMMITMENT + 1;
const TOTAL_PHASES = PHASE_FIRST_ACTION + 1;

export default function Onboarding() {
  const { user } = useAuth();
  const { addHabit } = useHabits();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Scores>({ ...INITIAL_SCORES });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  
  const [selectedHabits, setSelectedHabits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const starterHabitIdsRef = useRef(new Map<string, string>());
  const queryClient = useQueryClient();
  const [commitHeld, setCommitHeld] = useState(false);
  const [commitDone, setCommitDone] = useState(false);
  
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisCategoryIdx, setAnalysisCategoryIdx] = useState(0);
  const [firstActionDone, setFirstActionDone] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Analysis animation with per-category scanning
  useEffect(() => {
    if (step === PHASE_ANALYSIS) {
      setAnalysisComplete(false);
      setAnalysisCategoryIdx(0);
      const categoryTimers: ReturnType<typeof setTimeout>[] = [];
      categoryMeta.forEach((_, i) => {
        categoryTimers.push(setTimeout(() => {
          setAnalysisCategoryIdx(i + 1);
          vibrateLight();
        }, 800 + i * 700));
      });
      const t = setTimeout(() => {
        setAnalysisComplete(true);
        vibrateMedium();
      }, 800 + categoryMeta.length * 700 + 500);
      return () => { categoryTimers.forEach(clearTimeout); clearTimeout(t); };
    }
  }, [step]);

  const selectAnswer = (qIdx: number, optIdx: number) => {
    const q = QUESTIONS[qIdx];
    const opt = q.options[optIdx];
    setAnswers(prev => ({ ...prev, [q.id]: optIdx }));
    setScores(prev => {
      const next = { ...prev };
      (Object.entries(opt.scores) as [keyof Scores, number][]).forEach(([k, v]) => {
        next[k] = Math.max(0, Math.min(100, next[k] + v));
      });
      return next;
    });
    vibrateLight();
    setTimeout(() => setStep(s => s + 1), 400);
  };

  const toggleHabit = (name: string) => setSelectedHabits(prev =>
    prev.includes(name) ? prev.filter(h => h !== name) : [...prev, name]
  );

  const startCommit = useCallback(() => {
    setCommitHeld(true);
    vibrateMedium();
    holdTimer.current = setTimeout(() => {
      setCommitDone(true);
      vibrateHeavy();
      playLevelUp();
      // Auto-advance to next step after celebration
      setTimeout(() => {
        setStep(s => s + 1);
      }, 2000);
    }, 2500);
  }, []);

  const cancelCommit = useCallback(() => {
    if (!commitDone) {
      setCommitHeld(false);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    }
  }, [commitDone]);

  const finish = async () => {
    if (savingRef.current) return;
    if (!user) {
      logError('app', '[onboarding] finish called with no authenticated user');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const tags = getUserTags(scores);
      // Map raw answer indices to readable labels for Winston
      const lifestyle_data: Record<string, unknown> = { tags, scores };
      for (const q of QUESTIONS) {
        const idx = answers[q.id];
        if (typeof idx === 'number' && q.options[idx]) {
          lifestyle_data[q.id] = q.options[idx].label;
        }
      }

      logInfo('app', '[onboarding] saving profile', { userId: user.id });

      // Save selected starter habits first so a failed save never reports
      // onboarding as complete. IDs are stable across retries of this screen.
      for (const name of selectedHabits) {
        const starter = SUGGESTED_HABITS.find(h => h.name === name);
        if (!starter) continue;
        if (!starterHabitIdsRef.current.has(name)) {
          starterHabitIdsRef.current.set(name, crypto.randomUUID());
        }
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            addHabit({
          id: starterHabitIdsRef.current.get(name)!,
          name: starter.name,
          emoji: starter.emoji,
          category: starter.category,
          difficulty: starter.difficulty,
          frequency: 'daily',
          color: 'hsl(220, 80%, 65%)',
          reminder_time: null,
          reminder_enabled: true,
          reminder_tone: 'normal',
          custom_days: [],
          sound_mode: 'normal',
            }),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('habit_save_timeout')), 15_000);
            }),
          ]);
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      }

      // Persist completion + answers. Do not overwrite coach_gender here:
      // onboarding has no gender selection, and the existing profile value must be preserved.
      // `select()` confirms the row was actually written (RLS / id mismatch would return 0 rows silently).
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({
          onboarding_complete: true,
          lifestyle_data,
        } as any)
        .eq('user_id', user.id)
        .select('user_id, onboarding_complete');

      if (updateError) {
        logError('app', '[onboarding] profile update failed', updateError);
        throw updateError;
      }
      if (!updated || updated.length === 0) {
        logError('app', '[onboarding] profile update matched 0 rows', undefined, { userId: user.id });
        throw new Error('Could not save your profile. Please try again.');
      }
      logInfo('app', '[onboarding] profile saved', updated[0] as Record<string, unknown>);

      // Refresh the cached profile so the onboarding gate sees the new flag
      // BEFORE we navigate. Without this the gate can re-render onboarding.
      await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      await queryClient.refetchQueries({ queryKey: ['profile', user.id] });
      logInfo('navigation', '[onboarding] profile cache refreshed, navigating to coach');

      playXPEarned();
      // Signal the notification permission banner to prompt on first dashboard visit
      try { localStorage.setItem('notif_prompt_first_run', '1'); } catch { /* ignore */ }
      toast.success("You're all set! Winston is building your plan… 🚀");
      // Redirect into Coach with auto-trigger so Winston builds the plan immediately
      window.location.href = '/coach?action=todays_plan';
    } catch (error) {
      logError('app', '[onboarding] failed to save onboarding or starter habits', error);
      toast.error('Could not save your setup. Your selections are still here; please retry.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };


  const progressPercent = Math.round((step / (TOTAL_PHASES - 1)) * 100);

  const canGoNext = (): boolean => {
    if (step >= PHASE_QUESTIONS_START && step <= PHASE_QUESTIONS_END) {
      const qIdx = step - PHASE_QUESTIONS_START;
      return answers[QUESTIONS[qIdx].id] !== undefined;
    }
    if (step === PHASE_ANALYSIS) return analysisComplete;
    
    if (step === PHASE_COMMITMENT) return commitDone;
    if (step === PHASE_FIRST_ACTION) return firstActionDone;
    return true;
  };

  const handleNext = () => {
    if (step === PHASE_FIRST_ACTION) {
      finish();
      return;
    }
    if (step < TOTAL_PHASES - 1) setStep(s => s + 1);
  };

  const categoryMeta: { key: keyof Scores; emoji: string; label: string }[] = [
    { key: 'discipline', emoji: '🔥', label: 'Discipline' },
    { key: 'energy', emoji: '⚡', label: 'Energy' },
    { key: 'focus', emoji: '🎯', label: 'Focus' },
    { key: 'emotional', emoji: '🧠', label: 'Emotional Balance' },
    { key: 'structure', emoji: '⏳', label: 'Structure' },
  ];

  // ─── RENDER CURRENT STEP ───
  const renderStep = () => {
    // WELCOME
    if (step === PHASE_WELCOME) {
      return (
        <motion.div key="welcome" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center text-center flex-1 justify-center">
          <motion.img src={logo} alt="HabTastic" className="w-24 h-24 mb-6" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} />
          <h1 className="text-3xl font-bold font-display text-foreground mb-3">
            Welcome to <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">HabTastic</span>
          </h1>
          <p className="text-body text-muted-foreground mb-2">This isn't just another habit app.</p>
          <p className="text-body-lg text-foreground font-semibold mb-6">This is where your next version begins. ✨</p>
          <p className="text-caption text-muted-foreground max-w-xs">We'll ask a few quick questions to understand you — then build a system designed specifically for your life.</p>
        </motion.div>
      );
    }

    // THEME PICKER — Arctic Mint vs Midnight Navy preview
    if (step === PHASE_THEME) {
      return (
        <motion.div
          key="theme"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex-1 flex flex-col"
        >
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center"
            >
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </motion.div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Pick your vibe</h2>
            <p className="text-body text-muted-foreground max-w-xs mx-auto">
              Choose the theme that feels right. You can change this anytime in Settings.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <ThemePreviewCard
              variant="light"
              selected={theme === 'light'}
              onSelect={() => { setTheme('light'); vibrateLight(); }}
            />
            <ThemePreviewCard
              variant="dark"
              selected={theme === 'dark'}
              onSelect={() => { setTheme('dark'); vibrateLight(); }}
            />
          </div>
          <p className="text-caption text-muted-foreground text-center">
            ✨ Premium <span className="text-foreground font-semibold">Glow</span> theme available later in Settings
          </p>
        </motion.div>
      );
    }

    // QUESTIONS
    if (step >= PHASE_QUESTIONS_START && step <= PHASE_QUESTIONS_END) {
      const qIdx = step - PHASE_QUESTIONS_START;
      const q = QUESTIONS[qIdx];
      const selectedOpt = answers[q.id];
      return (
        <motion.div key={q.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="flex-1">
          <h2 className="text-2xl font-bold text-foreground leading-tight mb-8">{q.emoji} {q.question}</h2>
          <div className="space-y-3">
            {q.options.map((opt, i) => (
              <motion.button
                key={i}
                onClick={() => selectAnswer(qIdx, i)}
                whileTap={{ scale: 0.97 }}
                className={`w-full rounded-2xl p-5 flex items-center gap-4 text-left transition-all duration-200 ${
                  selectedOpt === i
                    ? 'bg-primary/15 border-2 border-primary shadow-lg'
                    : 'bg-card/80 border border-border/50 hover:bg-card'
                }`}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span className="font-semibold text-body text-foreground flex-1">{opt.label}</span>
                {selectedOpt === i && <Check className="w-5 h-5 text-primary" />}
              </motion.button>
            ))}
          </div>
        </motion.div>
      );
    }

    // AI ANALYSIS – dramatic scanning with per-category progress
    if (step === PHASE_ANALYSIS) {
      return (
        <motion.div key="analysis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center flex-1">
          {/* Scanning brain orb */}
          <motion.div
            className="w-32 h-32 rounded-full bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center mb-8 relative"
            animate={{
              rotate: analysisComplete ? 0 : 360,
              scale: analysisComplete ? [1, 1.15, 1] : [1, 1.05, 1],
            }}
            transition={analysisComplete
              ? { duration: 0.6, type: 'spring' }
              : { rotate: { duration: 2.5, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } }
            }
          >
            <Brain className="w-16 h-16 text-primary-foreground" />
            {/* Multiple orbiting rings */}
            {!analysisComplete && [0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full"
                style={{
                  border: '2px solid transparent',
                  borderTopColor: `hsl(var(--primary) / ${0.6 - i * 0.15})`,
                  borderRightColor: i === 0 ? 'hsl(var(--accent) / 0.3)' : 'transparent',
                }}
                animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                transition={{ duration: 1.2 + i * 0.4, repeat: Infinity, ease: 'linear' }}
              />
            ))}
            {/* Pulse effect */}
            {!analysisComplete && (
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            {analysisComplete ? 'Analysis Complete! ✅' : 'Scanning Your Profile...'}
          </h2>
          <p className="text-muted-foreground text-body mb-6">
            {analysisComplete ? 'Your personal blueprint is ready' : 'Deep-analyzing your patterns & potential'}
          </p>

          {/* Per-category scan indicators */}
          <div className="w-full max-w-xs space-y-2.5">
            {categoryMeta.map((cat, i) => {
              const scanned = i < analysisCategoryIdx;
              const scanning = i === analysisCategoryIdx - 1 && !analysisComplete;
              return (
                <motion.div
                  key={cat.key}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: i < analysisCategoryIdx || analysisComplete ? 1 : 0.3, x: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                  className="flex items-center gap-3"
                >
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="text-caption text-foreground font-medium w-28 text-left">{cat.label}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                      initial={{ width: 0 }}
                      animate={{ width: scanned || analysisComplete ? '100%' : scanning ? '60%' : '0%' }}
                      transition={{ duration: scanning ? 0.6 : 0.4 }}
                    />
                  </div>
                  {scanned || analysisComplete ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
                      <Check className="w-4 h-4 text-primary" />
                    </motion.div>
                  ) : (
                    <div className="w-4 h-4" />
                  )}
                </motion.div>
              );
            })}
          </div>

          {!analysisComplete && (
            <div className="mt-6 flex gap-1.5">
              {[0, 1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-primary"
                  animate={{ y: [0, -10, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          )}
        </motion.div>
      );
    }

    // RESULTS
    if (step === PHASE_RESULTS) {
      return (
        <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
          <h2 className="text-2xl font-bold text-foreground mb-2 text-center">Here's what we discovered about you 🔍</h2>
          <p className="text-caption text-muted-foreground text-center mb-6">Your personal analysis</p>
          <div className="space-y-3 mb-6">
            {categoryMeta.map(cat => {
              const val = scores[cat.key];
              const info = getScoreLabel(val);
              return (
                <motion.div
                  key={cat.key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-card/80 border border-border/50 rounded-2xl p-4 flex items-center gap-3"
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-body text-foreground">{cat.label}</p>
                    <div className="w-full h-2 bg-muted rounded-full mt-1 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                        initial={{ width: 0 }}
                        animate={{ width: `${val}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                      />
                    </div>
                  </div>
                  <span className={`text-caption font-bold ${info.color}`}>{info.label}</span>
                </motion.div>
              );
            })}
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="bg-primary/10 border border-primary/20 rounded-2xl p-4 text-center"
          >
            <p className="text-body text-foreground font-medium">{getPersonalizedMessage(scores)}</p>
          </motion.div>
        </motion.div>
      );
    }

    // PLAN
    if (step === PHASE_PLAN) {
      const planItems = getPlanItems(scores);
      return (
        <motion.div key="plan" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
          <div className="text-center mb-8">
            <span className="text-4xl">📋</span>
            <h2 className="text-2xl font-bold text-foreground mt-3">Your Starting Plan</h2>
            <p className="text-muted-foreground text-caption mt-1">Personalized just for you</p>
          </div>
          <div className="space-y-3">
            {planItems.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="bg-card/80 border border-border/50 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">{i + 1}</div>
                <p className="text-body text-foreground font-medium">{item}</p>
              </motion.div>
            ))}
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-center text-caption text-muted-foreground mt-6"
          >
            HabTastic will guide you through each step 🚀
          </motion.p>
        </motion.div>
      );
    }


    // HABITS
    if (step === PHASE_HABITS) {
      return (
        <motion.div key="habits" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
          <div className="text-center mb-8">
            <span className="text-4xl">✨</span>
            <h2 className="text-2xl font-bold text-foreground mt-3">Pick starter habits</h2>
            <p className="text-body text-muted-foreground mt-2">You can always add more later</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SUGGESTED_HABITS.map(h => (
              <motion.button
                key={h.name}
                onClick={() => { toggleHabit(h.name); vibrateLight(); }}
                whileTap={{ scale: 0.95 }}
                className={`rounded-2xl p-4 flex flex-col items-center gap-2 transition-all duration-200 ${
                  selectedHabits.includes(h.name) ? 'bg-primary/15 border-2 border-primary shadow-lg' : 'bg-card/80 border border-border/50'
                }`}
              >
                <span className="text-2xl">{h.emoji}</span>
                <p className="font-semibold text-caption text-center text-foreground">{h.name}</p>
                {selectedHabits.includes(h.name) && <Check className="w-4 h-4 text-primary" />}
              </motion.button>
            ))}
          </div>
        </motion.div>
      );
    }

    // COMMITMENT
    if (step === PHASE_COMMITMENT) {
      return (
        <motion.div key="commit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center text-center flex-1">
          {!commitDone ? (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-2">Seal Your Commitment 🔐</h2>
              <p className="text-body text-muted-foreground mb-8 max-w-xs">
                This is your moment. Press and hold to commit to becoming better.
              </p>

              <motion.div
                className="relative w-36 h-36"
                onTouchStart={startCommit}
                onTouchEnd={cancelCommit}
                onMouseDown={startCommit}
                onMouseUp={cancelCommit}
                onMouseLeave={cancelCommit}
              >
                {/* Background ring */}
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                {/* Progress ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 144 144">
                  <circle cx="72" cy="72" r="68" fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${Math.PI * 136}`}
                    strokeDashoffset={commitHeld ? '0' : `${Math.PI * 136}`}
                    style={{ transition: commitHeld ? 'stroke-dashoffset 2.5s linear' : 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>

                {/* Fingerprint mode */}
                <div className={`absolute inset-0 flex items-center justify-center rounded-full transition-all duration-300 ${commitHeld ? 'bg-primary/20 scale-110' : 'bg-card'}`}>
                  <Fingerprint className={`w-16 h-16 transition-colors duration-300 ${commitHeld ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
              </motion.div>
              <p className="text-caption text-muted-foreground mt-6">
                Press & hold the fingerprint
              </p>
            </>
          ) : (
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.4 }}>
              <motion.div
                className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6 mx-auto"
                animate={{ boxShadow: ['0 0 0 0px hsl(var(--primary) / 0.4)', '0 0 0 20px hsl(var(--primary) / 0)', '0 0 0 0px hsl(var(--primary) / 0.4)'] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Check className="w-14 h-14 text-primary-foreground" />
              </motion.div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Commitment Locked In! 🔒</h2>
              <p className="text-body text-muted-foreground">Your transformation starts now.</p>
              <p className="text-caption text-primary mt-4 font-bold">You are now part of HabTastic ⚡</p>
            </motion.div>
          )}
        </motion.div>
      );
    }

    // FIRST ACTION
    if (step === PHASE_FIRST_ACTION) {
      const actions = [
        { emoji: '🌬️', label: 'Take a deep breath', icon: Wind },
        { emoji: '🤸', label: 'Stretch your body', icon: Dumbbell },
        { emoji: '💧', label: 'Drink water', icon: Droplets },
        { emoji: '🛏️', label: 'Make your bed', icon: BedDouble },
      ];
      return (
        <motion.div key="first-action" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1">
          <div className="text-center mb-8">
            <span className="text-4xl">🎯</span>
            <h2 className="text-2xl font-bold text-foreground mt-3">Let's start small</h2>
            <p className="text-body text-muted-foreground mt-2">Your first action is simple — but powerful.</p>
          </div>
          <div className="space-y-3 mb-6">
            {actions.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="bg-card/80 border border-border/50 rounded-2xl p-4 flex items-center gap-4"
              >
                <span className="text-2xl">{a.emoji}</span>
                <p className="text-body text-foreground font-medium">{a.label}</p>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <Button
              onClick={() => { setFirstActionDone(true); vibrateMedium(); playXPEarned(); }}
              disabled={firstActionDone}
              className="w-full rounded-2xl h-14 gradient-primary text-primary-foreground font-bold text-lg"
            >
              {firstActionDone ? 'Done! ✅' : 'I Did It! 💥'}
            </Button>
          </motion.div>
        </motion.div>
      );
    }

    return null;
  };

  // Questions auto-advance, so no Next button needed for those
  const isQuestionStep = step >= PHASE_QUESTIONS_START && step <= PHASE_QUESTIONS_END;
  const showNextButton = !isQuestionStep || answers[QUESTIONS[step - PHASE_QUESTIONS_START]?.id] !== undefined;
  const isLastStep = step === PHASE_FIRST_ACTION;

  return (
    <div className="min-h-screen flex flex-col px-6 pt-8 pb-6 bg-background">
      {/* Progress Bar */}
      <div className="flex items-center gap-3 mb-6">
        {step > 0 && step !== PHASE_ANALYSIS && (
          <button onClick={() => setStep(s => s - 1)} className="p-1">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-foreground rounded-full"
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      {/* Bottom Button */}
      {!isQuestionStep && step !== PHASE_COMMITMENT && (
        <div className="mt-6">
          <Button
            onClick={handleNext}
            disabled={!canGoNext() || saving}
            className="w-full rounded-2xl h-14 gradient-primary text-primary-foreground font-bold text-lg active:scale-[0.98] transition-transform"
          >
            {saving ? 'Setting up...' : isLastStep ? "Let's Go! 🚀" : (
              <>Continue <ChevronRight className="w-5 h-5 ml-1" /></>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
