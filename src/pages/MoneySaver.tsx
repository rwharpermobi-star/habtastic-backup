import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bot, CalendarDays, CheckCircle2, Flame, PiggyBank, Plus,
  Sparkles, Target, Trash2, TrendingUp, WalletCards, Lock,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { usePageMeta } from '@/lib/usePageMeta';
import { useMoneySaver, type SavingFrequency, type SavingsChallengeType } from '@/hooks/useMoneySaver';
import { useConfetti } from '@/hooks/useConfetti';
import {
  buildSavingsChartData,
  calculateSavingsMetrics,
  formatMoney,
  getCurrencyOptions,
  projectSavings,
} from '../../supabase/functions/_shared/savingsCalculations';

const TIPS = [
  'Move a small amount to savings as soon as money comes in, before optional spending starts.',
  'Pick one recurring expense this week and ask whether it still earns its place in your budget.',
  'Use a 24-hour pause for non-essential purchases. Most impulse buys lose their pull after a day.',
  'Save windfalls separately from normal income so they do not quietly disappear into everyday spending.',
  'Make the target visible. A named goal usually feels more real than a generic savings balance.',
  'Small automatic-looking habits still work with manual tracking: choose one day each week as your savings day.',
];

const PACE_LABEL = {
  ahead: 'Ahead of target',
  on_track: 'On track',
  slightly_behind: 'Slightly behind',
  significantly_behind: 'Significantly behind',
} as const;

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function clampNumber(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function CreateGoalWizard({ onCreated }: { onCreated?: () => void }) {
  const { createGoal } = useMoneySaver();
  const currencies = useMemo(() => getCurrencyOptions(), []);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [already, setAlready] = useState('0');
  const [date, setDate] = useState('');
  const [currency, setCurrency] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const targetNum = Number(target);
  const alreadyNum = Number(already || 0);
  const preview = targetNum > 0 && date ? calculateSavingsMetrics({
    target_amount: targetNum,
    current_amount: Math.max(0, alreadyNum),
    starting_amount: Math.max(0, alreadyNum),
    target_date: date,
    created_at: new Date().toISOString(),
    currency,
  }) : null;

  const canNext = step === 0 ? name.trim().length > 0
    : step === 1 ? Number.isFinite(targetNum) && targetNum > 0 && !!currency
    : step === 2 ? Number.isFinite(alreadyNum) && alreadyNum >= 0
    : !!date;

  const submit = async () => {
    if (!name.trim() || targetNum <= 0 || alreadyNum < 0 || !date || !currency) return;
    setSaving(true);
    try {
      await createGoal({ name, targetAmount: targetNum, alreadySaved: alreadyNum, targetDate: date, currency, reason });
      toast.success('Savings goal created 💰');
      onCreated?.();
    } catch (e) {
      toast.error(e?.message || 'Could not create savings goal');
    } finally { setSaving(false); }
  };

  return (
    <div className="glass rounded-card p-5 shadow-card border border-primary/15">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-primary/12 text-primary flex items-center justify-center"><PiggyBank className="w-5 h-5" /></div>
        <div>
          <h2 className="font-display font-bold text-h3 text-foreground">Turn small savings into big wins.</h2>
          <p className="text-sm text-muted-foreground">Create your first savings goal</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-5" aria-label={`Step ${step + 1} of 4`}>
        {[0,1,2,3].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-secondary'}`} />)}
      </div>

      {step === 0 && <label className="block"><span className="text-sm font-semibold">What are you saving for?</span><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Holiday, emergency fund, laptop…" className="mt-2 w-full rounded-xl bg-secondary/50 border border-border px-4 py-3 outline-none focus:border-primary" /></label>}
      {step === 1 && <div className="space-y-3"><label className="block"><span className="text-sm font-semibold">How much is the goal?</span><input inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} placeholder="10000" className="mt-2 w-full rounded-xl bg-secondary/50 border border-border px-4 py-3 outline-none focus:border-primary" /></label><label className="block"><span className="text-xs text-muted-foreground">Currency</span><select value={currency} onChange={e => setCurrency(e.target.value)} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-4 py-3"><option value="" disabled>Choose currency</option>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>}
      {step === 2 && <label className="block"><span className="text-sm font-semibold">How much have you already saved?</span><input inputMode="decimal" value={already} onChange={e => setAlready(e.target.value)} className="mt-2 w-full rounded-xl bg-secondary/50 border border-border px-4 py-3 outline-none focus:border-primary" /></label>}
      {step === 3 && <div className="space-y-3"><label className="block"><span className="text-sm font-semibold">When do you want to reach it?</span><input type="date" value={date} min={isoDate(new Date())} onChange={e => setDate(e.target.value)} className="mt-2 w-full rounded-xl bg-secondary/50 border border-border px-4 py-3" /></label><label className="block"><span className="text-xs text-muted-foreground">Why this matters (optional)</span><input value={reason} onChange={e => setReason(e.target.value)} placeholder="A short reason to keep you focused" className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-4 py-3" /></label>{preview && <div className="rounded-xl bg-primary/8 border border-primary/15 p-4 text-sm"><p className="font-semibold text-foreground">Your starting plan</p><p className="mt-1 text-muted-foreground">Daily: <b className="text-foreground">{formatMoney(preview.dailyNeeded, currency)}</b> · Weekly: <b className="text-foreground">{formatMoney(preview.weeklyNeeded, currency)}</b> · Monthly: <b className="text-foreground">{formatMoney(preview.monthlyNeeded, currency)}</b></p></div>}</div>}

      <div className="flex gap-2 mt-6">
        {step > 0 && <button onClick={() => setStep(s => s - 1)} className="px-4 py-2.5 rounded-btn bg-secondary text-foreground font-semibold">Back</button>}
        {step < 3 ? <button disabled={!canNext} onClick={() => canNext && setStep(s => s + 1)} className="flex-1 px-4 py-2.5 rounded-btn gradient-primary text-primary-foreground font-semibold disabled:opacity-40">Continue</button> : <button disabled={!canNext || saving} onClick={submit} className="flex-1 px-4 py-2.5 rounded-btn gradient-primary text-primary-foreground font-semibold disabled:opacity-40">{saving ? 'Creating…' : 'Create my savings goal'}</button>}
      </div>
    </div>
  );
}

export default function MoneySaver() {
  usePageMeta({ title: 'Money Saver — HabTastic AI', description: 'Build a saving habit with goals, tracking, challenges, forecasts and Winston.', canonicalPath: '/money-saver' });
  const navigate = useNavigate();
  const { fireConfetti } = useConfetti();
  const {
    goals, activeGoals, lockedGoals, completedGoals, entries, activeChallenges, loading,
    canCreateGoal, addSavings, updateGoal, deleteGoal, createChallenge, updateChallenge,
  } = useMoneySaver();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [quickAmount, setQuickAmount] = useState('');
  const [tipIndex, setTipIndex] = useState(0);
  const [income, setIncome] = useState('');
  const [needsPct, setNeedsPct] = useState(50);
  const [wantsPct, setWantsPct] = useState(30);
  const [regularAmount, setRegularAmount] = useState('');
  const [regularFrequency, setRegularFrequency] = useState<SavingFrequency>('weekly');
  const [targetEdit, setTargetEdit] = useState('');
  const [dateEdit, setDateEdit] = useState('');
  const [challengeType, setChallengeType] = useState<SavingsChallengeType>('seven_day');
  const [challengeAmount, setChallengeAmount] = useState('');
  const [challengeDays, setChallengeDays] = useState('14');

  const visibleGoals = [...activeGoals, ...completedGoals];
  const selectedGoal = visibleGoals.find(g => g.id === selectedId) ?? visibleGoals[0] ?? null;
  const goalEntries = selectedGoal ? entries.filter(e => e.goal_id === selectedGoal.id) : [];
  const metrics = selectedGoal ? calculateSavingsMetrics(selectedGoal) : null;
  const chartData = selectedGoal ? buildSavingsChartData(selectedGoal, goalEntries) : [];
  const savingsPct = 100 - needsPct - wantsPct;

  useEffect(() => {
    if (!selectedGoal) return;
    setSelectedId(selectedGoal.id);
    setRegularAmount(String(selectedGoal.regular_saving_amount ?? ''));
    setRegularFrequency(selectedGoal.saving_frequency || 'weekly');
    setTargetEdit(String(selectedGoal.target_amount));
    setDateEdit(selectedGoal.target_date);
  }, [selectedGoal?.id]);

  useEffect(() => {
    if (!selectedGoal || !metrics) return;
    const milestones = [25, 50, 75, 100];
    const hit = [...milestones].reverse().find(x => metrics.progressPercent >= x);
    if (!hit) return;
    const key = `money-saver-milestone-${selectedGoal.id}-${hit}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      fireConfetti();
      toast.success(hit === 100 ? 'Goal smashed! 🎉' : `${hit}% savings milestone! 🎉`);
    } catch { /* private storage */ }
  }, [selectedGoal?.id, metrics?.progressPercent, fireConfetti]);

  if (loading) return <div className="min-h-screen pb-24 px-5 pt-14 bg-background"><div className="h-10 w-44 bg-secondary animate-pulse rounded-xl mb-6" /><div className="h-56 bg-secondary/40 animate-pulse rounded-card" /></div>;

  const saveMoney = async (amount: number) => {
    if (!selectedGoal || !Number.isFinite(amount) || amount <= 0) return;
    try {
      const updated = await addSavings(selectedGoal.id, amount);
      const next = calculateSavingsMetrics(updated);
      toast.success(next.isComplete ? 'Goal smashed! 🎉' : `Nice move — ${formatMoney(amount, selectedGoal.currency)} saved.`);
      setQuickAmount('');
    } catch (e) { toast.error(e?.message || 'Could not record savings'); }
  };

  const saveGoalSettings = async () => {
    if (!selectedGoal) return;
    const target = Number(targetEdit);
    if (!Number.isFinite(target) || target <= 0 || !dateEdit) return toast.error('Enter a valid target and date');
    try {
      await updateGoal(selectedGoal.id, { target_amount: target, target_date: dateEdit });
      toast.success('Goal updated');
    } catch (e) { toast.error(e?.message || 'Could not update goal'); }
  };

  const saveForecastSettings = async () => {
    if (!selectedGoal) return;
    const amount = Number(regularAmount || 0);
    if (!Number.isFinite(amount) || amount < 0) return toast.error('Enter a valid regular saving amount');
    try {
      await updateGoal(selectedGoal.id, { regular_saving_amount: amount, saving_frequency: regularFrequency });
      toast.success('Forecast settings updated');
    } catch (e) { toast.error(e?.message || 'Could not update forecast'); }
  };

  const startChallenge = async () => {
    if (!selectedGoal) return;
    let start = new Date();
    if (challengeType === 'no_spend_weekend') {
      const daysUntilSaturday = (6 - start.getDay() + 7) % 7;
      start = addDays(start, daysUntilSaturday);
    }
    const days = challengeType === 'seven_day' ? 7 : challengeType === 'thirty_day' ? 30 : challengeType === 'no_spend_weekend' ? 2 : challengeType === 'daily_amount' ? 7 : challengeType === 'weekly_amount' ? 28 : clampNumber(Number(challengeDays || 14), 1, 365);
    const end = addDays(start, days - 1);
    const amount = challengeType === 'no_spend_weekend' ? null : Number(challengeAmount || 0);
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) return toast.error('Enter a challenge savings target');
    const titleMap: Record<SavingsChallengeType, string> = {
      daily_amount: 'Daily savings streak', weekly_amount: 'Weekly savings push', no_spend_weekend: 'No-spend weekend', seven_day: '7-day savings challenge', thirty_day: '30-day savings challenge', custom: 'Custom savings challenge',
    };
    try {
      await createChallenge({ goalId: selectedGoal.id, title: titleMap[challengeType], type: challengeType, targetAmount: amount, currency: selectedGoal.currency, startDate: isoDate(start), endDate: isoDate(end) });
      toast.success('Savings challenge started 🔥');
    } catch (e) { toast.error(e?.message || 'Could not start challenge'); }
  };

  const markNoSpendToday = async (challenge) => {
    const today = isoDate(new Date());
    const completed = Array.from(new Set([...(challenge.completed_dates || []), today]));
    try { await updateChallenge(challenge.id, { completed_dates: completed }); toast.success('No-spend day marked ✓'); }
    catch (e) { toast.error(e?.message || 'Could not update challenge'); }
  };

  const deleteSelected = async () => {
    if (!selectedGoal || !window.confirm(`Delete “${selectedGoal.name}” and its savings history?`)) return;
    try { await deleteGoal(selectedGoal.id); setSelectedId(null); toast.success('Savings goal deleted'); }
    catch (e) { toast.error(e?.message || 'Could not delete goal'); }
  };

  const forecast = (months: number) => {
    if (!selectedGoal) return 0;
    const regular = Math.max(0, Number(regularAmount || selectedGoal.regular_saving_amount || 0));
    const frequency = regularFrequency || selectedGoal.saving_frequency;
    const periods = frequency === 'daily' ? Math.round(months * 30.4375) : frequency === 'weekly' ? Math.round(months * 4.348) : months;
    return projectSavings(Number(selectedGoal.current_amount), regular, periods);
  };

  const activeChallenge = selectedGoal ? activeChallenges.find(c => c.goal_id === selectedGoal.id) : null;
  const challengeProgress = activeChallenge && selectedGoal ? (() => {
    const start = new Date(`${activeChallenge.start_date}T00:00:00Z`).getTime();
    const end = new Date(`${activeChallenge.end_date}T23:59:59Z`).getTime();
    const saved = entries.filter(e => e.goal_id === selectedGoal.id && new Date(e.saved_at).getTime() >= start && new Date(e.saved_at).getTime() <= end).reduce((s, e) => s + Number(e.amount), 0);
    const duration = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    const completedDays = new Set(activeChallenge.completed_dates || []).size;
    const pct = activeChallenge.challenge_type === 'no_spend_weekend'
      ? Math.min(100, (completedDays / duration) * 100)
      : activeChallenge.target_amount ? Math.min(100, (saved / Number(activeChallenge.target_amount)) * 100) : 0;
    const streakDates = activeChallenge.challenge_type === 'no_spend_weekend'
      ? [...new Set(activeChallenge.completed_dates || [])]
      : [...new Set(entries.filter(e => e.goal_id === selectedGoal.id && new Date(e.saved_at).getTime() >= start).map(e => String(e.saved_at).slice(0, 10)))];
    streakDates.sort().reverse();
    let streak = 0; let cursor = isoDate(new Date());
    for (const d of streakDates) { if (d === cursor) { streak++; cursor = isoDate(addDays(new Date(`${cursor}T00:00:00Z`), -1)); } }
    return { saved, completedDays, pct, streak, duration };
  })() : null;

  return (
    <motion.div className="min-h-screen pb-28 px-5 pt-12 bg-background" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1"><h1 className="text-h1 text-foreground">💰 Money Saver</h1><p className="text-caption text-muted-foreground">Build the habit. Watch the numbers move.</p></div>
        <button onClick={() => navigate('/coach')} className="w-10 h-10 rounded-full bg-primary/12 text-primary flex items-center justify-center" aria-label="Ask Winston"><Bot className="w-5 h-5" /></button>
      </div>

      {((!visibleGoals.length && canCreateGoal) || showCreate) && (
        <div className="mb-6"><CreateGoalWizard onCreated={() => setShowCreate(false)} /></div>
      )}

      {lockedGoals.length > 0 && (
        <section className="glass rounded-card p-4 mb-6 shadow-card border border-primary/25">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-foreground">Saved Premium goals</p>
              <p className="text-caption text-muted-foreground">
                Nothing was deleted. Free keeps 1 active Money Saver goal; these unlock with all their progress when Premium is active again.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {lockedGoals.map(goal => (
              <button
                key={goal.id}
                type="button"
                onClick={() => navigate('/pricing')}
                className="w-full rounded-xl border border-border/50 bg-secondary/30 p-3 text-left flex items-center gap-3"
              >
                <Lock className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{goal.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(goal.current_amount, goal.currency)} saved of {formatMoney(goal.target_amount, goal.currency)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-primary">Unlock</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedGoal && metrics && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            {visibleGoals.length > 1 && <select value={selectedGoal.id} onChange={e => setSelectedId(e.target.value)} className="flex-1 rounded-xl bg-secondary border border-border px-3 py-2 text-sm">{visibleGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
            <button
              onClick={() => canCreateGoal ? setShowCreate(v => !v) : navigate('/pricing')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold"
            >
              {canCreateGoal ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {canCreateGoal ? 'Goal' : 'Premium'}
            </button>
          </div>

          <section className="glass rounded-card p-5 shadow-card border border-primary/15">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Savings goal</p><h2 className="text-h2 font-display text-foreground mt-1">{selectedGoal.name}</h2>{selectedGoal.reason && <p className="text-sm text-muted-foreground mt-1">{selectedGoal.reason}</p>}</div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">{PACE_LABEL[metrics.paceStatus]}</span>
            </div>
            <div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-3xl font-display font-extrabold text-foreground">{formatMoney(selectedGoal.current_amount, selectedGoal.currency)}</p><p className="text-sm text-muted-foreground">of {formatMoney(selectedGoal.target_amount, selectedGoal.currency)}</p></div><p className="text-2xl font-bold text-primary">{Math.round(metrics.progressPercent)}%</p></div>
            <div className="h-3 rounded-full bg-secondary mt-3 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${metrics.progressPercent}%` }} className="h-full rounded-full gradient-primary" /></div>
            {metrics.isComplete ? <p className="mt-4 text-center font-display font-bold text-primary text-xl">Goal smashed! 🎉</p> : <div className="grid grid-cols-2 gap-3 mt-5"><div className="rounded-xl bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">Remaining</p><p className="font-bold mt-1">{formatMoney(metrics.amountRemaining, selectedGoal.currency)}</p></div><div className="rounded-xl bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">Time left</p><p className="font-bold mt-1">{metrics.daysRemaining} days</p></div><div className="rounded-xl bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">Weekly target</p><p className="font-bold mt-1">{formatMoney(metrics.weeklyNeeded, selectedGoal.currency)}</p></div><div className="rounded-xl bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">Estimated finish</p><p className="font-bold mt-1">{metrics.projectedCompletionDate ?? 'Set regular saving'}</p></div></div>}
            {!metrics.isComplete && <p className="mt-4 text-sm text-muted-foreground">To reach your {formatMoney(selectedGoal.target_amount, selectedGoal.currency)} goal on time, save approximately <b className="text-foreground">{formatMoney(metrics.weeklyNeeded, selectedGoal.currency)} every week</b>.</p>}
          </section>

          <section className="glass rounded-card p-5 shadow-card">
            <div className="flex items-center gap-2 mb-4"><Plus className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">Quick Save</h3></div>
            <div className="grid grid-cols-4 gap-2">{[10,20,50,100].map(a => <button key={a} onClick={() => saveMoney(a)} className="rounded-xl bg-primary/10 text-primary py-3 text-sm font-bold active:scale-95">{formatMoney(a, selectedGoal.currency)}</button>)}</div>
            <div className="flex gap-2 mt-3"><input inputMode="decimal" value={quickAmount} onChange={e => setQuickAmount(e.target.value)} placeholder="Custom amount" className="flex-1 min-w-0 rounded-xl bg-secondary/50 border border-border px-3 py-2.5" /><button onClick={() => saveMoney(Number(quickAmount))} className="px-4 rounded-xl gradient-primary text-primary-foreground font-bold">Save money</button></div>
          </section>

          <section className="glass rounded-card p-4 shadow-card">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-primary" /><h3 className="font-bold">Savings tip</h3></div><p className="text-sm text-muted-foreground leading-relaxed">{TIPS[tipIndex % TIPS.length]}</p><button onClick={() => setTipIndex(i => i + 1)} className="text-xs text-primary font-semibold mt-3">Show another tip</button>
          </section>

          <section className="glass rounded-card p-5 shadow-card">
            <div className="flex items-center gap-2 mb-4"><TrendingUp className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">Planned vs actual</h3></div>
            <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} /><YAxis tick={{ fontSize: 10 }} width={42} /><Tooltip formatter={(value) => formatMoney(Number(value), selectedGoal.currency)} /><Line type="monotone" dataKey="planned" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} name="Planned" /><Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={3} connectNulls={false} name="Actual" /><Line type="monotone" dataKey="goal" stroke="hsl(var(--accent))" dot={false} name="Goal" /></LineChart></ResponsiveContainer></div>
            <p className="text-xs text-muted-foreground mt-2">Actual line uses only your recorded Money Saver entries. No fake history is generated.</p>
          </section>

          <section className="glass rounded-card p-5 shadow-card">
            <div className="flex items-center gap-2 mb-4"><WalletCards className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">50 / 30 / 20 budget tool</h3></div>
            <label className="text-xs text-muted-foreground">Monthly income<input inputMode="decimal" value={income} onChange={e => setIncome(e.target.value)} placeholder="0" className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2.5 text-foreground" /></label>
            <div className="grid grid-cols-2 gap-3 mt-4"><label className="text-xs text-muted-foreground">Needs %<input type="number" min={0} max={100} value={needsPct} onChange={e => { const n = clampNumber(Number(e.target.value),0,100); setNeedsPct(n); setWantsPct(w => Math.min(w,100-n)); }} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2" /></label><label className="text-xs text-muted-foreground">Wants %<input type="number" min={0} max={100-needsPct} value={wantsPct} onChange={e => setWantsPct(clampNumber(Number(e.target.value),0,100-needsPct))} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2" /></label></div>
            <div className="grid grid-cols-3 gap-2 mt-4 text-center">{[['Needs',needsPct],['Wants',wantsPct],['Savings',savingsPct]].map(([label,pct]) => <div key={String(label)} className="rounded-xl bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">{label} · {pct}%</p><p className="font-bold mt-1">{formatMoney((Number(income||0)*Number(pct))/100, selectedGoal.currency)}</p></div>)}</div><p className="text-xs text-muted-foreground mt-3">Percentages always total 100%. Adjust Needs and Wants; Savings fills the remainder.</p>
          </section>

          <section className="glass rounded-card p-5 shadow-card">
            <div className="flex items-center gap-2 mb-4"><Flame className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">Savings challenges</h3></div>
            {activeChallenge && challengeProgress ? <div className="rounded-xl bg-primary/8 border border-primary/15 p-4 mb-4"><div className="flex justify-between gap-2"><div><p className="font-bold">{activeChallenge.title}</p><p className="text-xs text-muted-foreground">{activeChallenge.start_date} → {activeChallenge.end_date}</p></div><span className="text-sm font-bold text-primary">{Math.round(challengeProgress.pct)}%</span></div><div className="h-2 bg-secondary rounded-full overflow-hidden mt-3"><div className="h-full gradient-primary" style={{ width: `${challengeProgress.pct}%` }} /></div><div className="flex gap-4 mt-3 text-xs text-muted-foreground"><span>Saved: <b className="text-foreground">{formatMoney(challengeProgress.saved, selectedGoal.currency)}</b></span><span>Streak: <b className="text-foreground">{challengeProgress.streak} days</b></span></div>{activeChallenge.challenge_type === 'no_spend_weekend' && <button onClick={() => markNoSpendToday(activeChallenge)} className="mt-3 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold">Mark today no-spend</button>}</div> : null}
            <div className="grid grid-cols-2 gap-2">{([['seven_day','7-day'],['thirty_day','30-day'],['daily_amount','Daily save'],['weekly_amount','Weekly save'],['no_spend_weekend','No-spend weekend'],['custom','Custom']] as [SavingsChallengeType,string][]).map(([type,label]) => <button key={type} onClick={() => setChallengeType(type)} className={`rounded-xl px-3 py-2 text-sm font-semibold border ${challengeType===type?'border-primary bg-primary/10 text-primary':'border-border bg-secondary/30 text-foreground'}`}>{label}</button>)}</div>
            {challengeType !== 'no_spend_weekend' && <input inputMode="decimal" value={challengeAmount} onChange={e => setChallengeAmount(e.target.value)} placeholder="Challenge savings target" className="mt-3 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2.5" />}{challengeType === 'custom' && <input type="number" min={1} max={365} value={challengeDays} onChange={e => setChallengeDays(e.target.value)} placeholder="Days" className="mt-2 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2.5" />}<button onClick={startChallenge} className="mt-3 w-full rounded-xl gradient-primary text-primary-foreground py-2.5 font-bold">Start challenge</button>
          </section>

          <section className="glass rounded-card p-5 shadow-card">
            <div className="flex items-center gap-2 mb-4"><CalendarDays className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">Savings forecast</h3></div>
            <div className="grid grid-cols-[1fr_auto] gap-2"><input inputMode="decimal" value={regularAmount} onChange={e => setRegularAmount(e.target.value)} placeholder="Regular saving amount" className="rounded-xl bg-secondary/50 border border-border px-3 py-2.5 min-w-0" /><select value={regularFrequency} onChange={e => setRegularFrequency(e.target.value as SavingFrequency)} className="rounded-xl bg-secondary border border-border px-3 py-2"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
            <button onClick={saveForecastSettings} className="text-xs text-primary font-semibold mt-2">Save forecast settings</button>
            <div className="grid grid-cols-2 gap-2 mt-4">{[1,3,6,12].map(m => <div key={m} className="rounded-xl bg-secondary/45 p-3"><p className="text-xs text-muted-foreground">{m} month{m>1?'s':''}</p><p className="font-bold mt-1">{formatMoney(forecast(m), selectedGoal.currency)}</p></div>)}</div><p className="text-xs text-muted-foreground mt-3">These are projections, not guaranteed balances.</p>
          </section>

          <section className="glass rounded-card p-5 shadow-card">
            <div className="flex items-center gap-2 mb-3"><Target className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">Goal settings</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs text-muted-foreground">Target amount<input inputMode="decimal" value={targetEdit} onChange={e => setTargetEdit(e.target.value)} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2.5 text-foreground" /></label><label className="text-xs text-muted-foreground">Target date<input type="date" value={dateEdit} onChange={e => setDateEdit(e.target.value)} className="mt-1 w-full rounded-xl bg-secondary/50 border border-border px-3 py-2.5 text-foreground" /></label></div><button onClick={saveGoalSettings} className="mt-3 px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-bold text-sm">Update goal</button>
          </section>

          <button onClick={() => navigate('/coach')} className="w-full rounded-card p-5 gradient-primary text-primary-foreground shadow-card flex items-center gap-3 text-left"><div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center"><Bot className="w-5 h-5" /></div><div className="flex-1"><p className="font-display font-bold">Ask Winston about your savings</p><p className="text-sm opacity-85 mt-0.5">Winston uses your latest Money Saver data and the same calculations as this screen.</p></div></button>

          <button onClick={deleteSelected} className="w-full flex items-center justify-center gap-2 text-sm text-destructive py-3"><Trash2 className="w-4 h-4" /> Delete this savings goal</button>
        </div>
      )}

      {!selectedGoal && !showCreate && (
        <div className="text-center py-8">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <p className="mt-3 font-bold">No active savings goals</p>
          <button
            onClick={() => canCreateGoal ? setShowCreate(true) : navigate('/pricing')}
            className="mt-4 px-5 py-2.5 rounded-btn gradient-primary text-primary-foreground font-bold"
          >
            {canCreateGoal ? <Plus className="w-4 h-4 inline mr-1" /> : <Lock className="w-4 h-4 inline mr-1" />}
            {canCreateGoal ? 'Create goal' : 'Unlock saved goals'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
