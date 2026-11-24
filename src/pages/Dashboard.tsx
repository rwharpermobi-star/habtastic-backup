import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { useHabits } from '@/hooks/useHabits';
import { pendingCompletion } from '@/lib/offlineOutbox';
import { useProfile } from '@/hooks/useProfile';
import { usePremium } from '@/hooks/usePremium';

import { useStreakCelebration } from '@/hooks/useStreakCelebration';
import { useXPReward } from '@/hooks/useXPReward';
import { useSmartNotifications } from '@/hooks/useSmartNotifications';
import { useSurpriseReward } from '@/hooks/useSurpriseReward';
import { useSessionEndMessage } from '@/components/SessionEndMessage';
import HabitCard from '@/components/HabitCard';
import MoodCheckSheet from '@/components/MoodCheckSheet';
import { useStreakSaver } from '@/hooks/useStreakSaver';
import Paywall from '@/components/Paywall';
import DailyRewardPopup from '@/components/DailyRewardPopup';
import SurpriseRewardPopup from '@/components/SurpriseRewardPopup';
import StreakMilestoneBadge from '@/components/StreakMilestoneBadge';
import DashboardSkeleton from '@/components/skeletons/DashboardSkeleton';
import DailyChallengeCard from '@/components/DailyChallengeCard';
import DailyChestCard from '@/components/DailyChestCard';
import { LeaderboardRankCard } from '@/components/LeaderboardRankCard';
import WatchAdRewardCard from '@/components/WatchAdRewardCard';
import MoneySaverHomeCard from '@/components/MoneySaverHomeCard';

import ChallengeStreakBadge from '@/components/ChallengeStreakBadge';
import InstallBanner from '@/components/InstallBanner';
import NotificationPermissionBanner from '@/components/NotificationPermissionBanner';
import ThemeToggle from '@/components/ThemeToggle';
import LevelUpCelebration from '@/components/LevelUpCelebration';
import RankUpCelebration from '@/components/RankUpCelebration';
import LevelBadge from '@/components/LevelBadge';
import StarRating from '@/components/StarRating';
import { useLevelRewards, type GrantedLevelReward } from '@/hooks/useLevelRewards';
import { detectRankUp, type RankTier } from '@/lib/ranks';
import { useAuth } from '@/contexts/AuthContext';

import BackgroundMusicControl from '@/components/BackgroundMusicControl';
import LiveClock from '@/components/LiveClock';
import { User, Settings, Facebook, NotebookPen, Trophy, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNavigate } from 'react-router-dom';
import { formatLocalDate, todayStr, getLevelFromXP, getStage, getXpForDifficulty, isMilestoneLevel, MAX_LEVEL } from '@/lib/habitStore';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '@/components/LanguageSelector';
import { openFacebookCommunity } from '@/lib/facebookCommunity';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

export default function Dashboard() {
  usePageMeta({
    title: 'Your Habit Dashboard — HabTastic AI',
    description: 'Track today’s habits, streaks, XP and daily missions from your personal HabTastic AI dashboard.',
    canonicalPath: '/app',
  });

  const { t } = useTranslation();
  const showGreeting = useMediaQuery('(min-width: 400px)');
  const { habits, loading: habitsLoading, toggleCompletion } = useHabits();
  const { profile, loading: profileLoading } = useProfile();

  // A failed or stalled API request must not leave the dashboard skeleton visible forever.
  const [dashboardLoadTimedOut, setDashboardLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!profileLoading && !habitsLoading) {
      setDashboardLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setDashboardLoadTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [profileLoading, habitsLoading]);
  const { isPremium } = usePremium();

  const { pendingReward, clearReward } = useXPReward();
  const { activeReward, dismissReward } = useSurpriseReward();
  const { trackActivity } = useSmartNotifications(habits);
  const { claim } = useLevelRewards();
  useSessionEndMessage();
  useStreakSaver();
  const navigate = useNavigate();
  const today = todayStr();
  const [showPaywall, setShowPaywall] = useState(false);
  const [levelUp, setLevelUp] = useState<{ level: number; from: number; rewards: GrantedLevelReward[] } | null>(null);
  const [rankUp, setRankUp] = useState<RankTier | null>(null);
  const [dailyGoalComplete, setDailyGoalComplete] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !profile) return;
    const tier = detectRankUp(user.id, profile.xp);
    if (tier) setRankUp(tier);
  }, [user, profile?.xp]);

  const prevLevelRef = useRef<number | null>(null);

  // Show only habits due today
  const todaysHabits = useMemo(() => {
    const dow = new Date().getDay();
    return habits.filter((h) => {
      if (h.frequency === 'custom') return (h.custom_days || []).includes(dow);
      if (h.frequency === 'weekly') return dow === 1;
      return true;
    });
  }, [habits]);

  const completedToday = useMemo(
    () => todaysHabits.filter((h) => h.completions.includes(today)).length,
    [todaysHabits, today]
  );
  const totalToday = todaysHabits.length;
  const totalStreak = useMemo(
    () => habits.reduce((sum, h) => {
      let s = 0;
      const d = new Date();
      for (let i = 0; i < 365; i++) {
        const day = new Date(d);
        day.setDate(day.getDate() - i);
        const ds = formatLocalDate(day);
        if (h.completions.includes(ds)) s++;
        else if (i > 0) break;
      }
      return sum + s;
    }, 0),
    [habits]
  );
  const xp = profile?.xp || 0;
  const levelProgress = useMemo(() => getLevelFromXP(xp), [xp]);
  const { level, progress, xpCurrent, xpNeeded } = levelProgress;
  const nextLevel = Math.min(level + 1, MAX_LEVEL);
  const nextStage = getStage(nextLevel);
  const xpRemaining = Math.max(0, xpNeeded - xpCurrent);

  // Level-up detection. `lastSeenLevel` is seeded from the user's CURRENT level
  // on first load (including right after deployment / backfill), so historical
  // level-ups never replay as a chain of celebrations. Rewards are granted by
  // the server, which pays out only levels it hasn't already recorded.
  useEffect(() => {
    if (!user || !profile) return;
    const key = `habtastic-last-seen-level-${user.id}`;
    let seen: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) seen = Number(raw) || null;
    } catch { /* private mode */ }

    if (seen == null) {
      // First observation for this user: seed silently, then reconcile any
      // rewards the server owes them without showing a celebration.
      try { localStorage.setItem(key, String(level)); } catch { /* ignore */ }
      prevLevelRef.current = level;
      void claim();
      return;
    }

    if (level > seen) {
      const from = prevLevelRef.current ?? seen;
      void claim().then((granted) => {
        if (isMilestoneLevel(level)) {
          // Only 10/20/30/40/50 deserve a blocking celebration.
          setLevelUp({ level, from, rewards: granted });
          return;
        }

        // Ordinary level-ups are reflected by the persistent XP/level bar.
        // No extra toast: one completion should produce one feedback surface.
      });
      try { localStorage.setItem(key, String(level)); } catch { /* ignore */ }
    }
    prevLevelRef.current = level;
  }, [level, user, profile, claim]);

  const { activeBadge, dismissBadge } = useStreakCelebration(
    totalStreak,
    profile?.coach_gender as 'male' | 'female' | null
  );

  // Daily-goal status is shown inside the combined completion sheet so it never
  // stacks as a second banner.

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greetingMorning');
    if (hour < 17) return t('home.greetingAfternoon');
    return t('home.greetingEvening');
  };


  const [moodSheet, setMoodSheet] = useState<{
    open: boolean;
    habitId?: string;
    habitName?: string;
    habitEmoji?: string;
    xp?: number;
    xpPending?: boolean;
    dailyGoalComplete?: boolean;
  }>({ open: false });

  const handleToggle = useCallback(
    async (id: string) => {
      const habit = habits.find((h) => h.id === id);
      const wasCompleted = habit?.completions.includes(today);
      const completed = await toggleCompletion(id);
      // A failed durable queue write must never produce a success banner or XP.
      if (completed === true && !wasCompleted) {
        trackActivity();
        const remaining = todaysHabits.filter(
          (h) => h.id !== id && !h.completions.includes(today),
        ).length;
        const finishedDay = remaining === 0 && todaysHabits.some((h) => h.id === id);
        if (finishedDay) {
          // No ad here: logging habits is a core action (Play ad policy).
          setDailyGoalComplete(true);
        }

        // One completion = one feedback surface. XP confirmation, habit name,
        // Undo and mood check all live in this single bottom sheet.
        if (habit) {
          setMoodSheet({
            open: true,
            habitId: id,
            habitName: habit.name,
            habitEmoji: habit.emoji,
            xp: getXpForDifficulty(habit.difficulty),
            xpPending: Boolean(user?.id && pendingCompletion(user.id, id, today)),
            dailyGoalComplete: finishedDay,
          });
        }
      }
    },
    [toggleCompletion, habits, today, trackActivity, todaysHabits, user?.id]
  );

  if (profileLoading || habitsLoading) {
    if (!dashboardLoadTimedOut) return <DashboardSkeleton />;
    return (
      <div className="min-h-screen pb-24 px-5 pt-20 bg-background flex items-center justify-center">
        <div role="alert" className="glass rounded-2xl p-6 max-w-sm w-full text-center">
          <h2 className="text-lg font-bold text-foreground">Still connecting to HabTastic</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Your dashboard data is taking longer than expected to load. Check your connection and try again.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const cardAnim = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  };

  return (
    <>
      <div data-testid="dashboard-root" className="min-h-screen pb-24 bg-background">
        {/* Header */}
        <div className="px-4 sm:px-5 pt-6 pb-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <LiveClock className="text-base" />
            <div className="flex items-center gap-2 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    onClick={() => openFacebookCommunity('dashboard')}
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.06 }}
                    aria-label="Join the HabTastic AI Community"
                    className="w-9 h-9 rounded-full flex items-center justify-center shadow-[0_0_12px_rgba(24,119,242,0.45)] shrink-0"
                    style={{ backgroundColor: '#1877F2' }}
                  >
                    <Facebook className="w-4 h-4 text-white" fill="white" strokeWidth={2} />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Join the HabTastic AI Community</TooltipContent>
              </Tooltip>
              <motion.button
                type="button"
                onClick={() => navigate('/diary')}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.06 }}
                aria-label="Open my diary"
                className="w-9 h-9 rounded-full flex items-center justify-center shadow-[0_0_12px_hsl(var(--primary)/0.45)] shrink-0 bg-primary"
              >
                <NotebookPen className="w-4 h-4 text-primary-foreground" strokeWidth={2.2} />
              </motion.button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <LanguageSelector variant="pill" />
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <BackgroundMusicControl />
              <ThemeToggle />
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => navigate('/profile')}
                aria-label={t('common.settings', { defaultValue: 'Settings' })}
                className="flex items-center justify-center h-11 w-11 rounded-full bg-secondary/60 hover:bg-secondary text-foreground transition-colors shrink-0"
              >
                <Settings className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          {/* Hero: avatar + YOU GOT THIS + username */}
          <div className="flex flex-col items-center text-center mt-2 mb-2">
            <motion.button
              onClick={() => navigate('/profile')}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.35)] bg-secondary"
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
              aria-label="Open profile"
            >
              {visibleAvatarUrl(profile?.avatar_url) ? (
                <img loading="eager" decoding="async" fetchPriority="high" src={visibleAvatarUrl(profile.avatar_url) ?? undefined} alt="User profile avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
            </motion.button>

            {/* Long-term progression: compact level chip + earned stars */}
            <button
              type="button"
              onClick={() => navigate('/progress')}
              aria-label={`Level ${level}, view progression`}
              className="mt-3 flex flex-col items-center gap-1 rounded-xl px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <LevelBadge level={level} />
              <StarRating level={level} size="sm" />

              {/* XP progress to the next level */}
              <div className="mt-1 w-[min(78vw,320px)]" aria-label={level >= MAX_LEVEL ? 'Maximum level reached' : `${xpRemaining} XP to Level ${nextLevel}`}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold text-muted-foreground">
                  <span>{level >= MAX_LEVEL ? 'MAX LEVEL' : `${xpCurrent} / ${xpNeeded} XP`}</span>
                  <span className="text-primary">
                    {level >= MAX_LEVEL ? 'Mastered 👑' : `${xpRemaining} XP to Level ${nextLevel}`}
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full border border-primary/25 bg-secondary/80 shadow-inner">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-primary to-violet-500 shadow-[0_0_12px_hsl(var(--primary)/0.55)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(progress * 100)}%` }}
                    transition={{ duration: 0.65, ease: 'easeOut' }}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                </div>
                {level < MAX_LEVEL && (
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    Next: Level {nextLevel} · {nextStage.emoji} {nextStage.name}
                  </p>
                )}
              </div>
            </button>



            <AnimatePresence initial={false}>
              {showGreeting && (
                <motion.p
                  key="greeting-small"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {greeting()} ✨
                </motion.p>
              )}
            </AnimatePresence>

            <h1 className="mt-1 font-display font-extrabold tracking-tight text-foreground text-3xl sm:text-4xl">
              Your Daily Habit Dashboard
            </h1>

            <p className="mt-2 w-full px-2 text-center">
              <span
                className={`inline-block max-w-full break-words ${
                  isPremium || profile?.name?.toLowerCase() === 'romiq'
                    ? 'text-gradient-gold'
                    : 'text-gradient'
                } font-signature text-2xl sm:text-3xl leading-[1.05]`}
              >
                {profile?.name || t('home.hero')}
              </span>
            </p>
          </div>
        </div>

        <InstallBanner />
        <div className="mx-5 mb-2">
          <NotificationPermissionBanner />
        </div>

        {/* Main content — generous spacing */}
        <div className="px-5 mt-6 space-y-6">
          {/* Today's Habits */}
          <motion.div variants={cardAnim} initial="hidden" animate="visible" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-h3 font-display text-foreground">Today's Quests 🎯</h2>
              {totalToday > 0 && (
                <span className="text-caption text-muted-foreground font-semibold">
                  {completedToday}/{totalToday}
                </span>
              )}
            </div>

            {todaysHabits.length === 0 ? (
              <div className="glass p-8 text-center shadow-card">
                <p className="text-5xl mb-3" aria-hidden="true">🎯</p>
                <p className="font-semibold text-body-lg text-foreground font-display">Nothing due today</p>
                <p className="text-body text-muted-foreground mt-1 mb-5">
                  Add a habit to start building momentum.
                </p>
                <button
                  onClick={() => navigate('/habits')}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-btn gradient-primary text-primary-foreground font-semibold text-sm shadow-[0_0_18px_hsl(var(--primary)/0.45)] active:scale-[0.98] transition-transform"
                >
                  ✨ Add a habit
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {todaysHabits.map((h, i) => (
                  <HabitCard key={h.id} habit={h} onToggle={handleToggle} index={i} />
                ))}
              </div>
            )}
          </motion.div>

          {/* Money Saver — directly after daily habit content */}
          <motion.div variants={cardAnim} initial="hidden" animate="visible">
            <MoneySaverHomeCard />
          </motion.div>

          {/* Daily Reward Chest */}
          <motion.div variants={cardAnim} initial="hidden" animate="visible">
            <DailyChestCard unlocked={totalToday > 0 && completedToday >= totalToday} />
          </motion.div>

          {/* Leaderboard & Rankings */}
          <motion.div variants={cardAnim} initial="hidden" animate="visible">
            <LeaderboardRankCard />
          </motion.div>


          {/* Daily Challenge */}
          <motion.div variants={cardAnim} initial="hidden" animate="visible" className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">
                Winston's Challenge
              </p>
              <ChallengeStreakBadge variant="compact" />
            </div>
            <DailyChallengeCard />
          </motion.div>

          {/* Optional rewarded ad + banner (free users only, native app only) */}
          <WatchAdRewardCard />
        </div>
      </div>

      <Paywall open={showPaywall} onOpenChange={setShowPaywall} trigger="habits" />
      {pendingReward && !levelUp && !rankUp && !activeReward && !activeBadge && (
        <DailyRewardPopup xpEarned={pendingReward.amount} reason={pendingReward.reason} onClose={clearReward} />
      )}
      {activeBadge && !levelUp && !rankUp && !activeReward && (
        <StreakMilestoneBadge
          milestone={activeBadge.milestone}
          emoji={activeBadge.emoji}
          message={activeBadge.message}
          onClose={dismissBadge}
        />
      )}
      {levelUp && (
        <LevelUpCelebration
          level={levelUp.level}
          previousLevel={levelUp.from}
          rewards={levelUp.rewards}
          onClose={() => setLevelUp(null)}
        />
      )}
      <RankUpCelebration tier={levelUp ? null : rankUp} onClose={() => setRankUp(null)} />
      {activeReward && !levelUp && !rankUp && (
        <SurpriseRewardPopup reward={activeReward} onClose={dismissReward} />
      )}
      {/* Primary completion UI: never suppress this with secondary rewards. */}
      <MoodCheckSheet
        open={moodSheet.open}
        onOpenChange={(o) => {
          setMoodSheet((s) => ({ ...s, open: o }));
          if (!o) setDailyGoalComplete(false);
        }}
        habitId={moodSheet.habitId}
        habitName={moodSheet.habitName}
        habitEmoji={moodSheet.habitEmoji}
        xp={moodSheet.xp}
        xpPending={moodSheet.xpPending}
        dailyGoalComplete={moodSheet.dailyGoalComplete}
        onUndo={moodSheet.habitId ? async () => {
          await toggleCompletion(moodSheet.habitId!, { silent: true });
        } : undefined}
      />
    </>
  );
}