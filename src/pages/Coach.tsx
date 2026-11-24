import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { useProfile } from '@/hooks/useProfile';
import { useHabits } from '@/hooks/useHabits';
import { isFreeHabitLimitError } from '@/lib/habitErrors';
import { useChallenges } from '@/hooks/useChallenges';
import { usePremium } from '@/hooks/usePremium';
import { useAuth } from '@/contexts/AuthContext';
import { useCoachChat, Message } from '@/hooks/useCoachChat';
import { useGoals } from '@/hooks/useGoals';
import { useWinstonVoice, VoiceState, WINSTON_KEYS } from '@/hooks/useWinstonVoice';
import { useWinstonChallenges } from '@/hooks/useWinstonChallenges';
import WinstonChallengeCard from '@/components/WinstonChallengeCard';
import DailyChallengeCard from '@/components/DailyChallengeCard';
import ChallengeStreakBadge from '@/components/ChallengeStreakBadge';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';
import DailyReflectionCard from '@/components/DailyReflectionCard';
import MissedHabitRecoveryCard from '@/components/MissedHabitRecoveryCard';
import WinstonRetentionDashboard from '@/components/WinstonRetentionDashboard';
import { formatLocalDate, parseLocalDate, isLocalDate, todayStr } from '@/lib/habitStore';
import { Mic, MicOff, Settings2, Lock, Send, Sparkles, Calendar, TrendingUp, Heart, Zap, Trash2, Keyboard, X, Volume2, Plus, Copy, Check, Utensils, Dumbbell, Moon, MessageCircle, Flag } from 'lucide-react';
import WinstonAvatar, { WinstonMood } from '@/components/WinstonAvatar';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Paywall from '@/components/Paywall';
import LockedFeatureCard from '@/components/LockedFeatureCard';
import PremiumGate from '@/components/PremiumGate';
import { FEATURES } from '@/lib/featureGating';
import CoachSkeleton from '@/components/skeletons/CoachSkeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReportAIResponseDialog from '@/components/ReportAIResponseDialog';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import { getWinstonChatServiceMessage } from '@/lib/winstonServiceErrors';
import { edgeFunctionFetch } from '@/lib/edgeFunctionFetch';
import { Button } from '@/components/ui/button';
import WinstonAdRewardCard from '@/components/WinstonAdRewardCard';
import { useWinstonAdReward } from '@/hooks/useWinstonAdReward';
import { useAds } from '@/hooks/useAds';

// Winston chat goes through winston-money-saver, which forwards to ai-coach.
const CHAT_FUNCTION = 'winston-money-saver';

type PlanHabit = { title: string; category?: string; frequency?: string; difficulty?: 'easy' | 'medium' | 'hard'; emoji?: string };
type WinstonPlan = {
  summary?: string;
  focus_areas?: string[];
  weekly_plan?: string[];
  daily_habits?: PlanHabit[];
  today_plan?: string[];
  motivation?: string;
  mode?: 'normal' | 'bounce_back' | 'push_harder';
};
function extractPlanJSON(text: string): WinstonPlan | null {
  const m = text.match(/```json-plan\s*([\s\S]*?)```/i);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()) as WinstonPlan; } catch { return null; }
}
function stripPlanJSON(text: string): string {
  return text.replace(/```json-plan\s*[\s\S]*?```/gi, '').trim();
}

function extractDailyHabits(text: string): string[] {
  const m = text.match(/(?:✅\s*)?\*\*Daily habits\*\*[^\n]*\n([\s\S]*?)(?:\n\s*(?:📅|💬|\*\*|```)|$)/i);
  if (!m) return [];
  const block = m[1];
  return block
    .split('\n')
    .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(l => l && !l.startsWith('**') && l.length < 80)
    .slice(0, 5);
}

function mapCategory(c?: string): string {
  const x = (c || '').toLowerCase();
  if (x.includes('fit')) return 'fitness';
  if (x.includes('mind') || x.includes('focus') || x.includes('mental')) return 'mindfulness';
  if (x.includes('rec') || x.includes('sleep')) return 'health';
  if (x.includes('prod') || x.includes('work')) return 'productivity';
  if (x.includes('learn') || x.includes('study') || x.includes('read')) return 'learning';
  if (x.includes('soc')) return 'social';
  return 'health';
}
function mapFrequency(f?: string): 'daily' | 'weekly' | 'custom' {
  const x = (f || '').toLowerCase();
  if (x.includes('week') && !x.includes('daily')) return 'weekly';
  if (x.includes('weekday') || x.includes('weekend')) return 'custom';
  return 'daily';
}
function customDaysFor(f?: string): number[] {
  const x = (f || '').toLowerCase();
  if (x.includes('weekday')) return [1, 2, 3, 4, 5];
  if (x.includes('weekend')) return [0, 6];
  return [];
}

function getTimeGreeting(name: string): string {
  const h = new Date().getHours();
  if (h < 5) return `Burning the midnight oil, ${name}?`;
  if (h < 12) return `Good morning, ${name} ☀️`;
  if (h < 17) return `Good afternoon, ${name} 👋`;
  if (h < 21) return `Good evening, ${name} 🌇`;
  return `Winding down, ${name}? 🌙`;
}

const IDLE_PROMPTS = [
  'Say something. Let\'s fix your day.',
  "What's stopping you today?",
  'Talk to me — I\'m listening.',
  'Tell me what\'s on your mind.',
  'One thing you want to crush today?',
  'Stuck? Let\'s break it down together.',
  'How are you really doing?',
  "What's the next small win?",
];

function haptic(pattern: number | number[] = 12) {
  try { (navigator as any)?.vibrate?.(pattern); } catch { /* ignore: best effort */ }
}

let _audioCtx: AudioContext | null = null;
function playStartCue() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx!;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.09);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.2);
  } catch { /* ignore: best effort */ }
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-secondary/60 border border-border/20 backdrop-blur-sm w-fit"
    >
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
      <span className="ml-1 text-[11px] text-muted-foreground">Winston is thinking…</span>
    </motion.div>
  );
}

function ListeningWave() {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full bg-[#A3E635]"
          animate={{ height: ['25%', `${40 + Math.random() * 60}%`, '25%'] }}
          transition={{ duration: 0.6 + Math.random() * 0.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
        />
      ))}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, color = 'primary' }: { icon; label: string; onClick: () => void; color?: 'primary' | 'accent' | 'success' | 'destructive' }) {
  const colorMap: Record<string, string> = {
    primary: 'text-primary border-primary/25 bg-primary/8',
    accent: 'text-accent border-accent/25 bg-accent/8',
    success: 'text-success border-success/25 bg-success/8',
    destructive: 'text-destructive border-destructive/25 bg-destructive/8',
  };
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[12px] font-semibold whitespace-nowrap backdrop-blur-sm transition-all hover:opacity-80 ${colorMap[color]}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </motion.button>
  );
}

function ChatBubble({ msg, index, onReplay, isReplaying }: { msg: Message; index: number; onReplay?: () => void; isReplaying?: boolean }) {
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const timeLabel = msg.ts
    ? new Date(msg.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(stripPlanJSON(msg.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[82%]`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed shadow-sm ${
            isUser
              ? 'bg-gradient-to-br from-primary to-primary/85 text-primary-foreground rounded-br-md'
              : 'bg-gradient-to-br from-card to-secondary/40 text-foreground border border-border/30 rounded-bl-md backdrop-blur-sm'
          }`}
        >
          {isUser ? (
            msg.content
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&_strong]:text-foreground [&_strong]:font-semibold">
              <ReactMarkdown>{stripPlanJSON(msg.content)}</ReactMarkdown>
            </div>
          )}
        </div>
        <div className={`mt-1 flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
          {timeLabel && (
            <span className="text-[10px] text-muted-foreground/70">{timeLabel}</span>
          )}
          {!isUser && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-primary transition-colors"
              aria-label={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {!isUser && onReplay && (
            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-primary transition-colors"
              aria-label={isReplaying ? 'Stop playback' : 'Replay Winston voice'}
            >
              <Volume2 className={`w-3 h-3 ${isReplaying ? 'text-primary animate-pulse' : ''}`} />
              {isReplaying ? 'Stop' : 'Replay'}
            </button>
          )}
          {!isUser && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Report this Winston response"
            >
              <Flag className="w-3 h-3" />
              Report
            </button>
          )}
        </div>
        {!isUser && (
          <ReportAIResponseDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            responseText={stripPlanJSON(msg.content)}
            messageTs={msg.ts}
          />
        )}
      </div>
    </motion.div>
  );
}

export default function Coach() {
  usePageMeta({
    title: 'Winston AI Habit Coach — HabTastic AI',
    description: 'Chat with Winston, your AI habit coach, for personalised plans, motivation and daily accountability.',
    canonicalPath: '/coach',
  });

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { i18n } = useTranslation();
  const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];
  const languagePayload = { code: langInfo.code, name: langInfo.label };
  const { profile, loading: profileLoading } = useProfile();
  const { habits, addHabit } = useHabits();
  const { challenges, isActive } = useChallenges();
  const { canUseAI, aiMessagesLeft, trackAIMessage, isPremium, isPaidPremium, isTrialing, aiDailyLimit, FREE_HABIT_LIMIT } = usePremium();
  const { adsEnabled } = useAds();
  const adReward = useWinstonAdReward(adsEnabled);
  const { messages, addMessage, updateLastAssistant, clearHistory, loaded: chatLoaded, setMessages } = useCoachChat();

  // A stalled profile/history request should show a retry action, not an endless skeleton.
  const [winstonLoadTimedOut, setWinstonLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!profileLoading && chatLoaded) {
      setWinstonLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setWinstonLoadTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [profileLoading, chatLoaded]);
  const { activeGoals } = useGoals();
  const voice = useWinstonVoice();
  const winstonChallenges = useWinstonChallenges();
  const dailyChallenge = useDailyChallenge();

  const [showPaywall, setShowPaywall] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [importedFor, setImportedFor] = useState<string | null>(null);
  const [importingFor, setImportingFor] = useState<string | null>(null);
  const importBusyRef = useRef(false);
  const importDraftIdsRef = useRef(new Map<string, string>());
  const [idlePromptIndex, setIdlePromptIndex] = useState(() => Math.floor(Math.random() * IDLE_PROMPTS.length));
  const pttResolveRef = useRef<((transcript: string | null) => void) | null>(null);

  useEffect(() => {
    if (voice.state !== 'idle' || isStreaming) return;
    const t = setInterval(() => {
      setIdlePromptIndex((i) => (i + 1) % IDLE_PROMPTS.length);
    }, 5000);
    return () => clearInterval(t);
  }, [voice.state, isStreaming]);

  useEffect(() => {
    if (!dailyChallenge.hydrated) return;
    if (dailyChallenge.status === 'completed') return;
    let voiceEnabled = true;
    try { voiceEnabled = localStorage.getItem(WINSTON_KEYS.voiceEnabled) !== 'false'; } catch { /* storage blocked: keep default */ }
    if (!voiceEnabled) return;
    if (voice.state !== 'idle') return;

    const today = todayStr();
    const announcedKey = 'winston-challenge-announced';
    let last: string | null = null;
    try { last = localStorage.getItem(announcedKey); } catch { /* ignore: best effort */ }
    if (last === today) return;

    const t = dailyChallenge.template;
    const intro =
      t.type === 'comeback'
        ? `Welcome back. Today's challenge: ${t.description} One small win resets everything.`
        : `Today's challenge is simple. ${t.description} No excuses.`;

    const timer = setTimeout(() => {
      try { localStorage.setItem(announcedKey, today); } catch { /* ignore: best effort */ }
      voice.speak(intro).catch(() => {});
    }, 800);

    return () => clearTimeout(timer);
  }, [dailyChallenge.hydrated, dailyChallenge.status, dailyChallenge.template, voice]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const remaining = aiMessagesLeft();
  const canWatchAdForMessages = adReward.available && !isPremium && (adReward.status?.viewsLeft ?? 0) > 0;
  const showAdRewardOffer = canWatchAdForMessages && remaining <= 0;

  const stats = useMemo(() => {
    const today = todayStr();
    const completedToday = habits.filter(h => h.completions.includes(today)).length;
    const total = habits.length;
    const missedToday = total - completedToday;

    let bestStreak = 0;
    habits.forEach(h => {
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (h.completions.includes(formatLocalDate(d))) streak++;
        else if (i > 0) break;
      }
      bestStreak = Math.max(bestStreak, streak);
    });

    const y = new Date(); y.setDate(y.getDate() - 1);
    const yStr = formatLocalDate(y);
    const missedYesterday = habits.filter(h => !h.completions.includes(yStr)).length;

    return { completedToday, total, missedToday, bestStreak, missedYesterday };
  }, [habits]);

  const greetingSubline = useMemo(() => {
    if (stats.total === 0) return "Add a habit and I'll help you build momentum.";
    if (stats.missedYesterday >= 2 && stats.completedToday === 0) {
      return `You missed ${stats.missedYesterday} habits yesterday. Let's bounce back today 💪`;
    }
    if (stats.bestStreak >= 3) {
      return `You're on a ${stats.bestStreak}-day streak — let's keep it going 🔥`;
    }
    if (stats.completedToday === stats.total && stats.total > 0) {
      return `Perfect day — ${stats.completedToday}/${stats.total} habits done ✨`;
    }
    return `${stats.completedToday}/${stats.total} habits done today. What's next?`;
  }, [stats]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, isStreaming]);

  const notifyLimitReached = useCallback(() => {
    if (canWatchAdForMessages) {
      toast.error(`Daily Winston limit reached (${aiDailyLimit} messages). Watch a short ad below for more, or upgrade for unlimited.`);
      return;
    }
    toast.error(`Daily Winston limit reached (${aiDailyLimit} messages). Resets tomorrow — or upgrade for unlimited.`);
    setShowPaywall(true);
  }, [canWatchAdForMessages, aiDailyLimit]);

  const sendToAI = useCallback(async (text: string, opts?: { speak?: boolean; action?: string }) => {
    if (!text.trim()) return;
    if (!canUseAI()) {
      notifyLimitReached();
      return;
    }

    // Speak every reply (typed or spoken) when Voice Responses is on, unless the
    // caller explicitly asked for silence.
    let voiceEnabled = true;
    try { voiceEnabled = localStorage.getItem(WINSTON_KEYS.voiceEnabled) !== 'false'; } catch { /* storage blocked: keep default */ }
    const shouldSpeak = opts?.speak ?? voiceEnabled;
    const userMsg: Message = { role: 'user', content: text, ts: new Date().toISOString() };
    await addMessage(userMsg);

    setIsStreaming(true);
    voice.setState('processing');

    let firstTokenSeen = false;
    const stillThinkingTimer = window.setTimeout(() => {
      if (!firstTokenSeen) {
        toast.message('Still thinking…', { description: 'Hang tight, Winston is putting it together.' });
      }
    }, 8000);
    const controller = new AbortController();
    const hardTimer = window.setTimeout(() => controller.abort(), 30000);

    try {
      const resp = await edgeFunctionFetch(CHAT_FUNCTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // winston-money-saver validates body.messages (not body.message).
          // Include the current turn because React state has not updated yet.
          messages: [...messages, userMsg]
            .filter((m): m is Message => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0)
            .slice(-40)
            .map(m => ({ role: m.role, content: m.content.trim().slice(0, 10000) })),
          stream: true,
          language: { code: languagePayload.code },
          action: opts?.action,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const serviceMessage = getWinstonChatServiceMessage(resp.status, err.code || err.error);
        throw Object.assign(
          new Error(serviceMessage || err.message || err.error || `Request failed (${resp.status})`),
          { serviceStatus: resp.status, serviceCode: err.code },
        );
      }

      if (!resp.body) throw new Error('No response stream');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantText = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                window.clearTimeout(stillThinkingTimer);
              }
              assistantText += content;
              updateLastAssistant(assistantText);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      window.clearTimeout(stillThinkingTimer);
      window.clearTimeout(hardTimer);

      const reply = assistantText || "I'm here for you. Tell me more.";
      if (!assistantText) updateLastAssistant(reply);
      await trackAIMessage();
      setIsStreaming(false);

      if (shouldSpeak) {
        await voice.speak(stripPlanJSON(reply));
      } else {
        voice.setState('idle');
      }
    } catch (e) {
      window.clearTimeout(stillThinkingTimer);
      window.clearTimeout(hardTimer);
      console.error('Coach error:', e);
      const aborted = e?.name === 'AbortError';
      const errorMessage = aborted ? 'Winston took too long. Try again.' : (e.message || 'Something went wrong. Try again.');
      const serviceMessage = e?.serviceStatus === 402 || e?.serviceStatus === 429 || e?.serviceStatus === 401
        ? getWinstonChatServiceMessage(e.serviceStatus, e.serviceCode)
        : null;
      toast.error(errorMessage);
      voice.setState('idle');
      setIsStreaming(false);
      setMessages(prev => [...prev, { role: 'assistant', content: serviceMessage || "Sorry, I'm having trouble right now. Try again in a moment. 🙏" }]);
    }
  }, [messages, session, canUseAI, isPremium, isPaidPremium, isTrialing, notifyLimitReached, addMessage, updateLastAssistant, trackAIMessage, voice, setMessages]);

  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!chatLoaded || profileLoading) return;
    const action = searchParams.get('action');
    if (action !== 'todays_plan') return;
    if (!isPremium) return;
    autoRanRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
    sendToAI("Build my personalized Today's Plan using my onboarding lifestyle data, habits, and goals.", { action: 'todays_plan', speak: false });
  }, [chatLoaded, profileLoading, isPremium, searchParams, setSearchParams, sendToAI]);

  const importHabitsFromPlan = useCallback(async (planText: string) => {
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    setImportingFor(planText);
    try {
    const plan = extractPlanJSON(planText);
    const structured: PlanHabit[] = plan?.daily_habits?.length
      ? plan.daily_habits
      : extractDailyHabits(planText).map(t => ({ title: t }));
    if (structured.length === 0) {
      toast.error("Couldn't find a Daily habits list in this plan.");
      return;
    }
    const existingNames = new Set(habits.map(h => h.name.toLowerCase().trim()));
    const fresh = structured.filter(h => !existingNames.has(h.title.toLowerCase().trim()));
    if (fresh.length === 0) {
      toast.message('All these habits are already in your list ✨');
      setImportedFor(planText);
      return;
    }

    const slotsLeft = isPremium ? fresh.length : Math.max(0, FREE_HABIT_LIMIT - habits.length);
    const toAdd = fresh.slice(0, slotsLeft);
    const skipped = fresh.length - toAdd.length;
    if (toAdd.length === 0) {
      toast.message(`You're at the ${FREE_HABIT_LIMIT}-habit Free limit. Upgrade to Premium for unlimited habits.`);
      return; // Keep the import available if they upgrade later.
    }

    let added = 0;
    let failed = 0;
    for (const h of toAdd) {
      try {
        const key = `${planText}:${h.title.toLowerCase().trim()}`;
        if (!importDraftIdsRef.current.has(key)) importDraftIdsRef.current.set(key, crypto.randomUUID());
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            addHabit({
          id: importDraftIdsRef.current.get(key)!,
          name: h.title,
          emoji: h.emoji || '✅',
          color: 'hsl(160, 84%, 50%)',
          frequency: mapFrequency(h.frequency),
          category: mapCategory(h.category),
          difficulty: h.difficulty || 'easy',
          reminder_time: null,
          reminder_enabled: true,
          reminder_tone: 'normal',
          custom_days: customDaysFor(h.frequency),
          sound_mode: 'normal',
            }),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('habit_save_timeout')), 15_000);
            }),
          ]);
          importDraftIdsRef.current.delete(key);
          added++;
        } finally {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      } catch (error) {
        failed++;
        console.error('[Coach] failed to import habit', error);
        if (isFreeHabitLimitError(error)) setShowPaywall(true);
      }
    }
    if (failed === 0 && skipped === 0) setImportedFor(planText);
    const notes = [
      !isPremium && skipped > 0 ? `${skipped} skipped — ${FREE_HABIT_LIMIT}-habit Free limit` : null,
      failed > 0 ? `${failed} couldn't be added` : null,
    ].filter(Boolean);
    const suffix = notes.length ? ` (${notes.join('; ')})` : '';
    if (added > 0) {
      toast.success(`Added ${added} habit${added === 1 ? '' : 's'} from Winston's plan 🚀${suffix}`);
    } else {
      toast.error(`No habits were added${suffix || '.'}`);
    }
    } catch (error) {
      console.error('[Coach] habit import failed', error);
      toast.error('Could not import habits. Please try again.');
    } finally {
      importBusyRef.current = false;
      setImportingFor(null);
    }
  }, [habits, addHabit, isPremium, FREE_HABIT_LIMIT]);

  const handlePressStart = useCallback(async () => {
    // Free users are capped daily; Premium and the active 5-day trial are unlimited.
    if (!canUseAI()) {
      notifyLimitReached();
      return;
    }
    if (voice.state === 'speaking') voice.interrupt();
    if (voice.state === 'listening' || voice.state === 'processing' || isStreaming) return;

    haptic(15);
    playStartCue();

    const transcriptPromise = voice.startListening();
    transcriptPromise.then(async (transcript) => {
      pttResolveRef.current = null;
      if (transcript && transcript.trim()) {
        haptic([8, 40, 8]);
        await sendToAI(transcript, { speak: true });
      }
    });
    pttResolveRef.current = () => {};
  }, [voice, sendToAI, isStreaming, isPremium, isPaidPremium, isTrialing, canUseAI, notifyLimitReached]);

  const handlePressEnd = useCallback(() => {
    if (!pttResolveRef.current) return;
    haptic(8);
    voice.stopListening();
  }, [voice]);

  const handleSpeakingTap = useCallback(() => {
    if (voice.state === 'speaking') voice.interrupt();
  }, [voice]);

  const handleButtonKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      handlePressStart();
    }
  }, [handlePressStart]);
  const handleButtonKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handlePressEnd();
    }
  }, [handlePressEnd]);

  const handleTextSend = useCallback(async () => {
    const text = textInput.trim();
    if (!text || isStreaming) return;
    setTextInput('');
    await sendToAI(text);
  }, [textInput, isStreaming, sendToAI]);

  const quickActions = [
    { icon: Calendar, label: "Build today's plan", emoji: '🎯', color: 'primary' as const, prompt: "Build my personalized Today's Plan using my onboarding lifestyle data, habits, and goals.", action: 'todays_plan' },
    { icon: MessageCircle, label: 'Ask Winston', emoji: '💬', color: 'primary' as const, prompt: "I want to talk something through. Ask me one clarifying question first, then coach me." },
    { icon: TrendingUp, label: 'Analyze my progress', emoji: '📈', color: 'success' as const, prompt: "Quick progress check — what's working, what's slipping across my habits and goals? Spot patterns and give me one specific next step." },
    { icon: Sparkles, label: 'Motivate me', emoji: '💪', color: 'accent' as const, prompt: "Give me a short, energetic motivational push right now. Reference my current streak or recent wins. Make it personal and punchy." },
    { icon: Utensils, label: 'Help me eat better', emoji: '🥗', color: 'success' as const, prompt: "Coach me on eating better. Give me 3 simple, realistic nutrition wins I can start today based on my lifestyle." },
    { icon: Dumbbell, label: 'Create a workout', emoji: '🏃', color: 'accent' as const, prompt: "Create a beginner-friendly workout I can do this week. Consider my current fitness habits and available time." },
    { icon: Moon, label: 'Improve my sleep', emoji: '😴', color: 'primary' as const, prompt: "Help me improve my sleep. Give me a short evening routine and 3 concrete changes I can make tonight." },
  ];

  const suggestedQuestions = [
    'How do I stay motivated?',
    'Help me stop procrastinating.',
    'Give me a productivity routine.',
    'Improve my morning routine.',
    'Create healthy habits.',
    'Help me lose weight.',
    'How can I sleep better?',
  ];

  const dailyBriefing = useMemo(() => {
    const briefings = [
      { tag: "Today's Motivation", emoji: '⚡', body: 'Momentum beats motivation. Start with the tiniest step — it counts.' },
      { tag: "Today's Focus", emoji: '🎯', body: 'Pick one habit to protect today. Everything else is a bonus.' },
      { tag: 'Habit Tip of the Day', emoji: '💡', body: 'Stack a new habit onto something you already do daily — coffee, teeth-brushing, commute.' },
      { tag: "Winston's Daily Advice", emoji: '🧠', body: "Consistency > intensity. Show up small, show up daily. That's how identities change." },
      { tag: "Today's Motivation", emoji: '🔥', body: "You don't need more time. You need to protect the time you have." },
      { tag: 'Habit Tip of the Day', emoji: '📌', body: 'Make it obvious. Put the trigger for tomorrow\'s habit where you\'ll see it tonight.' },
      { tag: "Winston's Daily Advice", emoji: '🌱', body: 'Miss once, never twice. One slip is data. Two is a trend. Bounce back today.' },
    ];
    const dayIndex = Math.floor(Date.now() / 86400000) % briefings.length;
    return briefings[dayIndex];
  }, []);

  const encouragements = [
    "You're doing great today.",
    'Keep your streak alive!',
    'One habit at a time.',
    'Small steps create big results.',
    'Every tap on this page is a win.',
  ];
  const encouragement = useMemo(() => {
    const idx = Math.floor(Date.now() / 3600000) % encouragements.length;
    return encouragements[idx];
  }, []);

  const insights = useMemo(() => {
    const out: { icon; text: string }[] = [];
    if (stats.total === 0) return out;

    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i); return formatLocalDate(d);
    });
    const weeklyDone = last7.reduce((sum, day) =>
      sum + habits.filter(h => h.completions.includes(day)).length, 0);
    const weeklyPct = Math.round((weeklyDone / (stats.total * 7)) * 100);
    if (weeklyPct > 0) {
      out.push({ icon: TrendingUp, text: `You've completed ${weeklyPct}% of your habits this week.` });
    }

    const dayTotals: Record<number, number> = {};
    habits.forEach(h => h.completions.filter(isLocalDate).forEach(c => {
      const dow = parseLocalDate(c).getDay();
      dayTotals[dow] = (dayTotals[dow] || 0) + 1;
    }));
    const dayNames = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    const bestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
    if (bestDay && bestDay[1] > 2) {
      out.push({ icon: Sparkles, text: `You're strongest on ${dayNames[Number(bestDay[0])]}.` });
    }

    if (stats.bestStreak >= 3) {
      out.push({ icon: Zap, text: `Your best current streak is ${stats.bestStreak} days — keep it alive.` });
    }

    if (stats.missedYesterday >= 2) {
      out.push({ icon: Heart, text: `You missed ${stats.missedYesterday} habits yesterday. A small comeback today matters.` });
    }

    return out.slice(0, 4);
  }, [habits, stats]);

  const handleReplay = useCallback((text: string) => {
    if (!text?.trim()) return;
    haptic(8);
    if (voice.state === 'speaking') {
      voice.interrupt();
      return;
    }
    voice.speak(stripPlanJSON(text));
  }, [voice]);

  if (profileLoading || !chatLoaded) {
    if (!winstonLoadTimedOut) return <CoachSkeleton />;
    return (
      <div className="min-h-screen pb-24 px-5 pt-20 bg-background flex items-center justify-center">
        <div role="alert" className="glass rounded-2xl p-6 max-w-sm w-full text-center">
          <h2 className="text-lg font-bold text-foreground">Winston is not connecting</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Chat history or your profile is taking too long to load. Check your connection and try again.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const visibleMessages = messages.filter(m => !m.content.startsWith('[SYSTEM:'));
  const userName = profile?.name || 'Hero';

  const lastAssistantIdx = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <>
      <div className="h-[100dvh] flex flex-col bg-background relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full blur-[100px] opacity-40"
            animate={{
              backgroundColor: voice.state === 'listening' ? 'hsl(var(--success) / 0.18)'
                : voice.state === 'speaking' ? 'hsl(var(--primary) / 0.18)'
                : 'hsl(var(--primary) / 0.10)',
            }}
            transition={{ duration: 1.2 }}
          />
        </div>

        <AnimatePresence>
          {voice.state === 'speaking' && (
            <motion.div
              key="tl-soundwave"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.25 }}
              className="absolute top-3 left-3 z-20 flex items-end gap-[3px] h-6 px-2 py-1 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20"
              aria-hidden="true"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span
                  key={i}
                  className="w-[3px] rounded-full bg-primary"
                  animate={{ height: ['20%', '100%', '40%', '85%', '20%'] }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.12,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10 px-5 pt-12 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-body-lg text-foreground leading-tight">Winston</h1>
                <div className="flex items-end gap-[2px] h-3.5" aria-hidden="true">
                  {[0, 1, 2, 3].map(i => (
                    <motion.span
                      key={i}
                      className="w-[2px] rounded-full bg-primary"
                      animate={{ height: ['30%', '100%', '50%', '85%', '30%'] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                <p className="text-[11px] text-muted-foreground">
                  {voice.state === 'listening' ? 'Listening…'
                    : voice.state === 'processing' || isStreaming ? 'Thinking…'
                    : voice.state === 'speaking' ? 'Speaking…'
                    : 'Ready to help · Always here for you'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {visibleMessages.length > 0 && (
              <button
                onClick={async () => { if (confirm('Clear conversation?')) await clearHistory(); }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                aria-label="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => navigate('/settings/coach')}
              className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              aria-label="Winston settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative z-10 overflow-y-auto px-5 py-4">
          <div className="max-w-2xl mx-auto space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-card p-4 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent border border-primary/20 backdrop-blur-sm card-accent-primary"
            >
              <p className="text-body-lg font-bold text-foreground leading-snug">{getTimeGreeting(userName)}</p>
              <p className="text-caption text-muted-foreground mt-1.5 leading-relaxed">{greetingSubline}</p>
              <p className="text-caption text-primary/90 italic mt-2">✨ {encouragement}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="relative rounded-card p-4 bg-gradient-to-br from-accent/15 via-card to-primary/10 border border-accent/25 overflow-hidden card-accent-accent"
            >
              <motion.div
                aria-hidden
                className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, hsl(var(--accent) / 0.3) 0%, transparent 70%)' }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.25, 0.5] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="relative flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-accent/20 flex items-center justify-center text-xl shrink-0">
                  {dailyBriefing.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-caption uppercase tracking-wider font-bold text-accent">{dailyBriefing.tag}</p>
                  <p className="text-caption text-foreground mt-1 leading-relaxed">{dailyBriefing.body}</p>
                </div>
              </div>
            </motion.div>

            <div>
              <p className="text-caption uppercase tracking-wider font-bold text-muted-foreground mb-2 px-1">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((qa, i) => (
                  <motion.button
                    key={qa.label}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => sendToAI(qa.prompt, { action: (qa).action })}
                    disabled={isStreaming}
                    className="flex items-center gap-2 p-3 rounded-card bg-gradient-to-br from-card to-secondary/40 border border-border/40 hover:border-primary/40 transition-colors text-left disabled:opacity-50"
                  >
                    <span className="text-xl shrink-0">{qa.emoji}</span>
                    <span className="text-[12px] font-semibold text-foreground leading-tight">{qa.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-caption uppercase tracking-wider font-bold text-muted-foreground mb-2 px-1">Try asking</p>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 snap-x pb-1">
                {suggestedQuestions.map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendToAI(q)}
                    disabled={isStreaming}
                    className="snap-start shrink-0 px-3.5 py-2 rounded-full text-[12px] font-medium bg-primary/8 border border-primary/25 text-primary hover:bg-primary/15 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {insights.length > 0 && (
              <div className="rounded-card border border-border/40 bg-card/60 backdrop-blur-sm p-4 card-accent-primary">
                <p className="text-caption uppercase tracking-wider font-bold text-primary mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> AI Insights
                </p>
                <ul className="space-y-2">
                  {insights.map((ins, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-2 text-caption text-foreground"
                    >
                      <ins.icon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span className="leading-snug">{ins.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}

            {visibleMessages.length > 0 && (
              <button
                type="button"
                onClick={() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="w-full text-left rounded-card border border-primary/20 bg-primary/5 p-3 flex items-center gap-3 hover:bg-primary/10 transition-colors card-accent-primary"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-caption font-bold text-primary uppercase tracking-wider">Continue conversation</p>
                  <p className="text-caption text-foreground truncate">
                    {stripPlanJSON(visibleMessages[visibleMessages.length - 1].content).slice(0, 90)}
                  </p>
                </div>
              </button>
            )}

            <ChallengeStreakBadge variant="full" />
            <DailyChallengeCard />
            <PremiumGate
              feature={FEATURES.ADVANCED_AI}
              fallbackTitle="Premium AI Coaching"
              fallbackDescription="Your coaching history is saved. Activate Premium to continue personalised coaching."
            >
              <WinstonRetentionDashboard />
            </PremiumGate>
            <MissedHabitRecoveryCard />
            <DailyReflectionCard />

            <WinstonChallengeCard
              challenge={winstonChallenges.active}
              generating={winstonChallenges.generating}
              onGenerate={async () => {
                try {
                  await winstonChallenges.generate({
                    language: { code: languagePayload.code },
                  });
                  await trackAIMessage();
                } catch (e) {
                  toast.error(e.message || 'Could not generate challenge');
                }
              }}
              onAccept={(id) => { winstonChallenges.accept(id); toast.success('Challenge accepted 💪'); }}
              onDecline={(id) => { winstonChallenges.decline(id); }}
              onComplete={async (id) => {
                const ch = await winstonChallenges.complete(id);
                if (ch) toast.success(`🎉 +${ch.reward_xp} XP earned!`);
              }}
            />

            {visibleMessages.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="rounded-card p-4 bg-secondary/40 border border-border/20 backdrop-blur-sm"
              >
                <p className="text-caption text-foreground/85 leading-relaxed">
                  💬 Press &amp; hold the mic below to talk to me — or tap a quick action.
                </p>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {visibleMessages.map((msg, i) => {
                const isLastAssistant = i === lastAssistantIdx;
                const planJson = isLastAssistant && msg.role === 'assistant' ? extractPlanJSON(msg.content) : null;
                const planHabits = isLastAssistant && msg.role === 'assistant'
                  ? (planJson?.daily_habits?.map(h => h.title) ?? extractDailyHabits(msg.content))
                  : [];
                const showImport = planHabits.length > 0 && !isStreaming && importedFor !== msg.content;
                return (
                  <div key={`${i}-${msg.role}`}>
                    <ChatBubble
                      msg={msg}
                      index={i}
                      onReplay={isLastAssistant ? () => handleReplay(msg.content) : undefined}
                      isReplaying={isLastAssistant && voice.state === 'speaking'}
                    />
                    {showImport && (
                      <motion.button
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => { void importHabitsFromPlan(msg.content); }}
                        disabled={importingFor !== null}
                        className="mt-2 ml-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-caption font-semibold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {importingFor === msg.content ? 'Adding habits…' : <>Add {planHabits.length} habit{planHabits.length === 1 ? '' : 's'} to My Habits</>}
                      </motion.button>
                    )}
                  </div>
                );
              })}
            </AnimatePresence>

            {voice.voiceServiceMessage && (
              <div role="status" aria-live="polite" className="max-w-[82%] rounded-card px-4 py-2.5 text-caption text-foreground bg-secondary/40 border border-border/30">
                {voice.voiceServiceMessage}
              </div>
            )}

            {isStreaming && (
              <div className="flex justify-start">
                <TypingIndicator />
              </div>
            )}

            {voice.liveCaption && (voice.state === 'listening' || voice.state === 'speaking') && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <div className="max-w-[82%] rounded-card px-4 py-2.5 text-caption italic text-muted-foreground bg-secondary/40 border border-dashed border-border/40">
                  {voice.liveCaption}
                </div>
              </motion.div>
            )}

            <div ref={scrollRef} />
          </div>
        </div>

        <div className="relative z-10 px-5 pt-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-5 px-5 snap-x">
            {quickActions.map(qa => (
              <div key={qa.label} className="snap-start shrink-0">
                <QuickAction icon={qa.icon} label={qa.label} color={qa.color} onClick={() => sendToAI(qa.prompt, { action: (qa).action })} />
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 px-5 pt-4 pb-24 bg-gradient-to-t from-background via-background to-transparent">
          {voice.micError && (
            <p className="text-caption text-destructive text-center mb-2">{voice.micError}</p>
          )}
          {voice.needsUserGestureToPlay && (
            <div className="flex justify-center mb-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void voice.playPendingAudio()}>
                <Volume2 aria-hidden="true" />
                Tap to hear Winston
              </Button>
            </div>
          )}

          <div className="h-6 mb-3 flex items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {voice.state === 'listening' ? (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center gap-2"
                >
                  <ListeningWave />
                  <span className="text-caption font-semibold text-success">Listening… 👂</span>
                </motion.div>
              ) : voice.state === 'processing' || isStreaming ? (
                <motion.span
                  key="thinking"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-caption font-semibold text-primary"
                >
                  Thinking… 🧠
                </motion.span>
              ) : voice.state === 'speaking' ? (
                <motion.span
                  key="speaking"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-caption font-semibold text-primary"
                >
                  Winston is speaking… 🔊 <span className="text-muted-foreground font-normal">(tap to stop)</span>
                </motion.span>
              ) : (
                <motion.span
                  key={`idle-${idlePromptIndex}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4 }}
                  className="text-caption text-muted-foreground italic"
                >
                  “{IDLE_PROMPTS[idlePromptIndex]}”
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center justify-center gap-2">
            <motion.button
              type="button"
              role="button"
              aria-label={
                voice.state === 'listening' ? 'Recording — release to send'
                : voice.state === 'speaking' ? 'Tap to stop Winston'
                : 'Press and hold to talk'
              }
              aria-pressed={voice.state === 'listening'}
              tabIndex={0}
              disabled={isStreaming || voice.state === 'processing'}
              onPointerDown={(e) => {
                e.preventDefault();
                if (voice.state === 'speaking') { handleSpeakingTap(); return; }
                handlePressStart();
              }}
              onPointerUp={(e) => { e.preventDefault(); handlePressEnd(); }}
              onPointerLeave={() => { if (voice.state === 'listening') handlePressEnd(); }}
              onPointerCancel={() => { if (voice.state === 'listening') handlePressEnd(); }}
              onKeyDown={handleButtonKeyDown}
              onKeyUp={handleButtonKeyUp}
              onContextMenu={(e) => e.preventDefault()}
              animate={
                voice.state === 'listening'
                  ? { scale: 1.04 }
                  : voice.state === 'speaking'
                  ? { scale: 1.02 }
                  : voice.state === 'processing' || isStreaming
                  ? { scale: 1.01 }
                  : { scale: 1 }
              }
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="relative w-40 h-40 rounded-full flex items-center justify-center select-none touch-none focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 disabled:opacity-70 disabled:cursor-not-allowed bg-transparent"
            >
              <WinstonAvatar
                asDiv
                size={160}
                mood={((): WinstonMood => {
                  if (voice.state === 'listening') return 'listening';
                  if (voice.state === 'processing' || isStreaming) return 'thinking';
                  if (voice.state === 'speaking') return 'speaking';
                  if (stats.total > 0 && stats.completedToday === stats.total) return 'celebrating';
                  if (stats.bestStreak >= 3) return 'happy';
                  if (stats.missedYesterday >= 2 && stats.completedToday === 0) return 'sad';
                  return 'idle';
                })()}
              />
            </motion.button>

            <p className="text-body font-semibold text-foreground/90 mt-1">
              {voice.state === 'listening' ? 'Release to send'
                : voice.state === 'speaking' ? 'Tap to stop'
                : voice.state === 'processing' || isStreaming ? 'Working on it…'
                : 'Hold to Talk'}
            </p>
            <p className="text-caption text-muted-foreground">
              Press &amp; hold the mic — release when you're done
            </p>
          </div>

          {showAdRewardOffer && (
            <div className="mt-4 max-w-2xl mx-auto">
              <WinstonAdRewardCard
                perView={adReward.status?.perView ?? 3}
                viewsLeft={adReward.status?.viewsLeft ?? 0}
                watching={adReward.watching}
                onWatch={adReward.watchForMessages}
                onUpgrade={() => setShowPaywall(true)}
              />
            </div>
          )}

          <div className="mt-4 max-w-2xl mx-auto">
            {!showTextInput ? (
              <button
                type="button"
                onClick={() => setShowTextInput(true)}
                className="mx-auto flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Type a message instead"
              >
                <Keyboard className="w-3.5 h-3.5" />
                Type instead
              </button>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleTextSend(); setShowTextInput(false); }}
                className="flex items-center gap-2"
              >
                <Input
                  autoFocus
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Message Winston…"
                  disabled={isStreaming || voice.state === 'listening' || voice.state === 'processing'}
                  className="flex-1 h-11 rounded-full text-caption bg-card border-border/40 px-4"
                />
                <motion.button
                  type="submit"
                  disabled={!textInput.trim() || isStreaming}
                  whileTap={{ scale: 0.92 }}
                  className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center gradient-primary text-primary-foreground disabled:opacity-40 transition-all shadow-[0_0_16px_hsl(var(--primary)/0.35)]"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
                <button
                  type="button"
                  onClick={() => { setShowTextInput(false); setTextInput(''); }}
                  className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Close text input"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <Paywall open={showPaywall} onOpenChange={setShowPaywall} trigger="ai" />
    </>
  );
}
