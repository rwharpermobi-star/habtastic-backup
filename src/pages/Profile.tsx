import { formatLocalDate } from '@/lib/habitStore';
import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useHabits } from '@/hooks/useHabits';
import { useTheme } from '@/contexts/ThemeContext';
import { usePremium } from '@/hooks/usePremium';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  User, ChevronRight, Crown, Bell, Shield, LogOut, Camera,
  Flame, RotateCcw, Palette, Brain, Lock,
  Database, HelpCircle, Sparkles, MessageSquare, CreditCard, Gift,
  Users, Zap, Share2, Trash2, Bug, Check, Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import AvatarPicker from '@/components/AvatarPicker';
import { supabase } from '@/integrations/supabase/client';
import { useReferral } from '@/hooks/useReferral';
import RankBadge from '@/components/RankBadge';
import LevelBadge from '@/components/LevelBadge';
import StarRating from '@/components/StarRating';
import { getLevelFromXP } from '@/lib/progression';
import CustomShareCard from '@/components/CustomShareCard';
import CommunityCard from '@/components/CommunityCard';
import CrownBadge from '@/components/CrownBadge';
import { useMyCrowns } from '@/hooks/useLeaderboardCrowns';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';

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

const SettingsItem = ({ icon: Icon, label, desc, onClick, right, destructive, iconColor, highlight }: {
  icon; label: string; desc?: string; onClick?: () => void;
  right?: React.ReactNode; destructive?: boolean; iconColor?: string; highlight?: boolean;
}) => (
  <motion.button
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`w-full flex items-center gap-3 p-4 hover:bg-secondary/50 transition-colors text-left border-b border-border/40 last:border-b-0 ${!onClick ? 'cursor-default' : ''}`}
  >
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
      destructive ? 'bg-destructive/10' : highlight ? 'bg-primary/15' : 'bg-primary/10'
    }`}>
      <Icon className={`w-[18px] h-[18px] ${iconColor || (destructive ? 'text-destructive' : 'text-primary')}`} strokeWidth={1.5} />
    </div>
    <div className="flex-1 min-w-0">
      <p className={`text-body font-medium ${destructive ? 'text-destructive' : 'text-foreground'}`}>{label}</p>
      {desc && <p className="text-caption text-muted-foreground truncate">{desc}</p>}
    </div>
    {right || (onClick && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />)}
  </motion.button>
);

export default function Profile() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile, updateProfile } = useProfile();
  const { habits, resetAll } = useHabits();
  const { theme } = useTheme();
  const { isPremium, isPaidPremium, isTrialing, trialDaysLeft, trialExpired, trialEndDate, nextBillingDate } = usePremium();
  const trialStartDate = profile?.trial_started_at ? new Date(profile.trial_started_at) : null;
  const planLabel = isPaidPremium ? 'Premium' : isTrialing ? 'Free Trial' : trialExpired ? 'Free (trial ended)' : 'Free';
  const { referralCode, referralCount, paidReferralCount, totalDaysEarned } = useReferral();
  const { data: myCrowns = [] } = useMyCrowns();
  const topCrown = myCrowns[0];
  const profileLevel = getLevelFromXP(profile?.xp || 0).level;
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(profile?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);
  // Delete Account lives in Security & Privacy now.


  const handleReset = useCallback(async () => {
    if (resetting || resetConfirmation.trim() !== 'RESET') return;
    setResetting(true);
    try {
      await resetAll();
      setResetOpen(false);
      setResetConfirmation('');
      toast.success('All habits cleared. Fresh start! 🚀');
    } catch (error) {
      console.error('[Profile] reset habits failed', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Reset failed: ${message}`);
    } finally {
      setResetting(false);
    }
  }, [resetAll, resetting, resetConfirmation]);

  // handleDeleteAccount moved to PrivacySettings.


  const totalStreak = useMemo(() => habits.reduce((sum, h) => sum + getStreak(h.completions), 0), [habits]);
  const streakMessage = totalStreak > 0 ? `${totalStreak}-day streak 🔥` : "Let's get back on track 💪";

  const validateName = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Please enter your name.';
    if (trimmed.length < 2) return 'Name must be at least 2 characters.';
    if (trimmed.length > 30) return 'Name must be 30 characters or less.';
    return null;
  };

  const onNameChange = (value: string) => {
    setNameInput(value);
    if (nameError) setNameError(validateName(value));
  };

  const saveName = async () => {
    const err = validateName(nameInput);
    if (err) {
      setNameError(err);
      return;
    }
    setSavingName(true);
    try {
      await updateProfile({ name: nameInput.trim() });
      setEditing(false);
      setNameError(null);
      toast.success('Name saved ✓');
    } catch {
      toast.error('Could not save name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const cancelEdit = () => {
    setNameInput(profile?.name || '');
    setNameError(null);
    setEditing(false);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <h1 className="text-h1 text-foreground mb-6">Settings</h1>

      {/* ─── Profile Card ─── */}
      <div className="glass rounded-card p-5 mb-5 shadow-card">
        <div className="flex items-center gap-4">
          <AvatarPicker>
            <button type="button" className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary/30 shadow-card group flex-shrink-0">
              {visibleAvatarUrl(profile?.avatar_url) ? (
                <img loading="lazy" decoding="async" src={visibleAvatarUrl(profile.avatar_url) ?? undefined} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </button>
          </AvatarPicker>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div>
                <div className="flex gap-2">
                  <Input
                    value={nameInput}
                    onChange={e => onNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className={`bg-secondary border-border rounded-input h-10 ${nameError ? 'border-destructive ring-1 ring-destructive/40' : ''}`}
                    maxLength={30}
                    autoFocus
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'profile-name-error' : undefined}
                    placeholder="Your name"
                  />
                  <Button
                    onClick={saveName}
                    size="sm"
                    disabled={savingName || !!validateName(nameInput)}
                    className="gradient-primary text-primary-foreground rounded-btn disabled:opacity-50"
                  >
                    {savingName ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    onClick={cancelEdit}
                    size="sm"
                    variant="ghost"
                    disabled={savingName}
                    className="rounded-btn"
                  >
                    Cancel
                  </Button>
                </div>
                {nameError && (
                  <p id="profile-name-error" role="alert" className="text-[11px] text-destructive mt-1.5">
                    {nameError}
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`font-signature text-2xl sm:text-3xl leading-[1.05] truncate ${isPremium ? 'text-gradient-gold' : 'text-foreground'}`}>{profile?.name || 'Hero'}</h2>
                  {topCrown && <CrownBadge place={topCrown.place} size="md" tooltip={`Monthly Top ${topCrown.place} winner`} />}
                  {isPremium ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[10px] font-semibold">
                      <Crown className="w-3 h-3" /> Premium
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
                      Free Plan
                    </span>
                    )}
                  </div>
                 <div className="flex items-center gap-2 flex-wrap mt-1">
                   <LevelBadge level={profileLevel} />
                   <StarRating level={profileLevel} size="sm" />
                 </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => { setNameInput(profile?.name || ''); setNameError(null); setEditing(true); }} className="text-[11px] text-primary hover:underline">Edit name</button>
                  <button onClick={() => navigate('/avatar')} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Customize avatar
                  </button>
                </div>
              </>
            )}
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1.5">
                <Flame className="w-3 h-3 text-primary" />
                <span className="text-[11px] text-muted-foreground">{streakMessage}</span>
              </div>
              {totalStreak > 0 && (
                <CustomShareCard kind="streak" value={totalStreak} unit="days" userName={profile?.name || 'I'}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[10px] text-primary font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20"
                    aria-label="Share streak"
                  >
                    <Share2 className="w-3 h-3" /> Share
                  </button>
                </CustomShareCard>
              )}
            </div>
          </div>
        </div>

        {!isPremium && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/pricing')}
            className="relative mt-4 w-full overflow-hidden rounded-btn px-4 py-2.5 bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground font-semibold text-sm shadow-[0_0_20px_hsl(var(--primary)/0.45)] hover:shadow-[0_0_28px_hsl(var(--primary)/0.6)] transition-shadow flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" />
            Upgrade to Premium
          </motion.button>
        )}
      </div>

      {/* ─── Premium CTA Card (only for Free users) ─── */}
      {!isPremium && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/pricing')}
          className="relative w-full overflow-hidden rounded-card p-5 mb-7 text-left bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 border border-primary/30 shadow-[0_0_30px_hsl(var(--primary)/0.25)]"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-primary/30 rounded-full blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-accent/20 rounded-full blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">🔓</span>
              <h3 className="font-bold text-body-lg text-foreground">Unlock Full Potential</h3>
            </div>
            <p className="text-caption text-muted-foreground mb-4 max-w-[90%]">
              Unlimited habits, unlimited Winston AI, advanced analytics, premium cosmetics & more.
            </p>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-btn bg-primary text-primary-foreground font-semibold text-sm shadow-[0_0_18px_hsl(var(--primary)/0.5)]">
              <Sparkles className="w-4 h-4" /> Upgrade to Premium
            </span>
          </div>
        </motion.button>
      )}

      {/* ─── Account ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Account</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-2">
        <SettingsItem
          icon={Crown}
          label={isTrialing ? 'Free Trial — Active' : isPaidPremium ? 'Premium Plan — Active' : 'Free Plan — Upgrade Available'}
          desc={
            isTrialing
              ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left · ends ${trialEndDate?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : isPaidPremium
                ? `Renews ${nextBillingDate?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) ?? 'soon'}`
                : 'Unlock all features'
          }
          onClick={() => navigate('/pricing')}
          iconColor={isPremium ? 'text-warning' : 'text-primary'}
          highlight={!isPremium}
        />
        {(isPaidPremium || isTrialing) && (
          <SettingsItem
            icon={CreditCard}
            label="Subscription"
            desc="Plan, renewal date, payment status & cancel"
            onClick={() => navigate('/settings/subscription')}
          />
        )}
        <SettingsItem icon={Bell} label="Notifications" desc="Reminders & alerts" onClick={() => navigate('/settings/notifications')} />
        <SettingsItem icon={Zap} label="XP Breakdown" desc="See how today's score was calculated" onClick={() => navigate('/xp-breakdown')} />
        <SettingsItem icon={Shield} label="Streak Shield" desc="Cooldown, limits & how it saves your streak" onClick={() => navigate('/streak-shield')} />
      </div>
      {isTrialing && (
        <p className="text-[11px] text-muted-foreground/80 px-2 mb-7 mt-1 leading-relaxed">
          You won't be charged until your trial ends on{' '}
          <span className="font-semibold text-foreground">
            {trialEndDate?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>. Cancel anytime.
        </p>
      )}
      {!isTrialing && <div className="mb-7" />}

      {/* ─── Trial Status ─── */}
      {trialStartDate && !isPaidPremium && (
        <>
          <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Trial Status</h3>
          <div className="glass rounded-card p-5 shadow-card mb-7 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted-foreground">Current plan</span>
              <span className={`font-semibold text-sm ${isTrialing ? 'text-success' : trialExpired ? 'text-destructive' : 'text-foreground'}`}>
                {planLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted-foreground">Days remaining</span>
              <span className="font-semibold text-sm text-foreground">
                {isTrialing ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''}` : '0 days'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted-foreground">{trialExpired ? 'Expired on' : 'Expires on'}</span>
              <span className="font-semibold text-sm text-foreground">
                {trialEndDate?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            {trialExpired && (
              <button
                onClick={() => navigate('/pricing')}
                className="w-full mt-2 py-2.5 rounded-btn gradient-primary text-white font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" /> Upgrade to Premium
              </button>
            )}
          </div>
        </>
      )}

      {/* ─── Community & Friends ─── */}
      <h3 className="font-semibold text-h3 mb-3 mt-6 text-muted-foreground">Community & Friends</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-2">
        <SettingsItem
          icon={Users}
          label="Friends"
          desc="Friend Code, requests, friends and habit challenges"
          onClick={() => navigate('/friends')}
        />
      </div>
      <CommunityCard />
      <p className="text-[11px] text-muted-foreground/80 px-2 mb-7 mt-1 leading-relaxed">
        Connect with existing HabTastic users, challenge friends, and join the official community.
      </p>

      {/* ─── Appearance ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Appearance</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-1">
        <SettingsItem icon={Palette} label="Theme & Colors" desc={`${theme === 'dark' ? 'Dark' : 'Light'} mode`} onClick={() => navigate('/settings/appearance')} />
      </div>
      <p className="text-[11px] text-muted-foreground/80 px-2 mb-7 mt-2 flex items-center gap-1">
        <Sparkles className="w-3 h-3 text-primary" /> Premium themes available
      </p>

      {/* ─── Sound & Haptics ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Sound & Haptics</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-7">
        <SettingsItem icon={Volume2} label="Sound & Haptics" desc="Sound effects, volume and vibration" onClick={() => navigate('/settings/sound')} />
      </div>

      {/* ─── Habits ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Habits</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-7">
        <SettingsItem icon={Brain} label="Habit & AI Preferences" desc="Mode, difficulty, focus areas" onClick={() => navigate('/settings/habits-ai')} />
      </div>

      {/* ─── Security & Privacy ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Security & Privacy</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-7">
        <SettingsItem icon={Lock} label="Security & Privacy" desc="Password, 2FA, export, delete account" onClick={() => navigate('/settings/privacy')} />
      </div>

      {/* ─── Backup & Restore ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Backup & Restore</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-7">
        <SettingsItem icon={Database} label="Backup & Restore" desc="Export, backup, or reset your progress" onClick={() => navigate('/settings/data')} />
      </div>

      {/* ─── Support & Legal ─── */}
      <h3 className="font-semibold text-h3 mb-3 text-muted-foreground">Support & Legal</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-7">
        <SettingsItem icon={HelpCircle} label="Help Center" desc="Learn how the app works" onClick={() => navigate('/about')} />
        <SettingsItem icon={MessageSquare} label="Send Feedback / Report Issue" desc="We'd love to hear from you" onClick={() => navigate('/settings/feedback')} />
        
        <SettingsItem icon={Shield} label="Terms of Service" desc="The rules for using HabTastic" onClick={() => navigate('/terms')} />
        <SettingsItem icon={Shield} label="Refund Policy" desc="Our refund terms" onClick={() => navigate('/refunds')} />
      </div>

      {/* Sign Out */}
      <div className="glass rounded-card overflow-hidden shadow-card mb-3">
        <SettingsItem icon={LogOut} label="Sign Out" destructive onClick={() => { signOut(); toast.success('Signed out'); }} />
      </div>

      {/* Delete Account moved to Security & Privacy */}

      <p className="text-center text-[11px] text-muted-foreground/70 mb-4">HabTastic v1.0 ✨</p>

      <AlertDialog open={resetOpen} onOpenChange={(open) => {
        setResetOpen(open);
        if (!open) setResetConfirmation('');
      }}>
        <AlertDialogContent className="glass border-border/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-destructive" /> Reset Entire Routine
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground space-y-2">
              <p>This will <strong className="text-destructive">permanently delete all your habits</strong> and their completion history.</p>
              <p>Your XP, level, and achievements will <strong>not</strong> be affected.</p>
              <p className="text-sm mt-2">⚠️ This action cannot be undone. Your XP, level, and achievements will remain unchanged.</p>
            </AlertDialogDescription>
            <p className="pt-2 font-medium text-foreground">To confirm, type <strong>RESET</strong> below.</p>
            <input
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Type RESET to confirm deleting all habits"
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder="Type RESET"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void handleReset(); }}
              disabled={resetting || resetConfirmation.trim() !== 'RESET'}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-btn"
            >
              {resetting ? 'Resetting...' : 'Continue and Reset Habits'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account dialog moved to Security & Privacy */}

    </motion.div>
  );
}
