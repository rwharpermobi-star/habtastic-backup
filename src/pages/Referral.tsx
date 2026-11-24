import { PRODUCTION_WEB_ORIGIN } from '@/lib/appOrigin';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReferral } from '@/hooks/useReferral';
import { useReferralHistory } from '@/hooks/useReferralHistory';
import { useProfile } from '@/hooks/useProfile';
import ReferralLiveStatus from '@/components/ReferralLiveStatus';
import ReferralLinkCopyCard from '@/components/ReferralLinkCopyCard';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Copy,
  Check,
  Gift,
  MessageCircle,
  Share2,
  Trophy,
  Crown,
  Mail,
  History,
  Flame,
  Sparkles,
  Facebook,
  Medal,
  Coins,
  Zap,
  PartyPopper,
  AlertTriangle,
} from 'lucide-react';

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { visibleAvatarUrl } from '@/lib/legacyAvatar';
import { untypedSupabase } from "@/integrations/supabase/untyped";

interface TopReferrer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  paid_referrals: number;
}

export default function Referral() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { referralCode, referralCount, paidReferralCount, totalDaysEarned, totalReferralXp, referralPointsBalance, statsError, refetchStats, MILESTONES } = useReferral();
  const { profile } = useProfile();
  const [codeCopied, setCodeCopied] = useState(false);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [celebrate, setCelebrate] = useState<{ count: number; badge: string } | null>(null);
  const { history, error: historyError, refetch: refetchHistory } = useReferralHistory();
  const prevPaidRef = useRef<number | null>(null);

  const MAX_TIER = MILESTONES[MILESTONES.length - 1].count;
  const overallProgress = Math.min((paidReferralCount / MAX_TIER) * 100, 100);
  const filledBlocks = Math.round((paidReferralCount / MAX_TIER) * 17);
  const blocks = '█'.repeat(filledBlocks) + '░'.repeat(17 - filledBlocks);

  const unlockedMilestones = MILESTONES.filter((m) => paidReferralCount >= m.count);
  const nextMilestone =
    MILESTONES.find((m) => paidReferralCount < m.count) ?? MILESTONES[MILESTONES.length - 1];
  const remainingToNext = Math.max(nextMilestone.count - paidReferralCount, 0);

  useEffect(() => {
    const seenKey = 'referral_milestones_seen';
    const seen: number[] = JSON.parse(localStorage.getItem(seenKey) || '[]');
    const justUnlocked = MILESTONES.find(
      (m) => paidReferralCount >= m.count && !seen.includes(m.count),
    );
    if (justUnlocked && prevPaidRef.current !== null) {
      setCelebrate({ count: justUnlocked.count, badge: justUnlocked.badge });
      localStorage.setItem(seenKey, JSON.stringify([...seen, justUnlocked.count]));
      const t = setTimeout(() => setCelebrate(null), 3500);
      return () => clearTimeout(t);
    }
    if (prevPaidRef.current === null) {
      const initial = MILESTONES.filter((m) => paidReferralCount >= m.count).map((m) => m.count);
      const merged = Array.from(new Set([...seen, ...initial]));
      localStorage.setItem(seenKey, JSON.stringify(merged));
    }
    prevPaidRef.current = paidReferralCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paidReferralCount]);

  useEffect(() => {
    (async () => {
      const { data } = await untypedSupabase.rpc('top_referrers_this_month', { _limit: 10 });
      if (data) setTopReferrers(data as unknown as TopReferrer[]);
    })();
  }, []);

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setCodeCopied(true);
    toast.success('Code copied!');
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const shareMessage = `I'm using HabTastic to crush my habits 💪⚡\n\nUse my code ${referralCode} and join: ${PRODUCTION_WEB_ORIGIN}`;

  const isAllowedShareHref = (href: string) => {
    if (href.startsWith('mailto:')) return true;
    try {
      const url = new URL(href);
      return url.protocol === 'https:' &&
        (url.hostname === 'api.whatsapp.com' || url.hostname === 'www.facebook.com');
    } catch {
      return false;
    }
  };

  const openExternal = (href: string, newTab = false) => {
    if (!isAllowedShareHref(href)) {
      toast.error('Could not open share.');
      return;
    }
    try {
      if (newTab) {
        const w = window.open(href, '_blank', 'noopener,noreferrer');
        if (!w) window.location.href = href;
      } else {
        window.location.href = href;
      }
    } catch {
      navigator.clipboard?.writeText(shareMessage).then(
        () => toast.success('Link copied!'),
        () => toast.error('Could not open share.'),
      );
    }
  };

  const shareWhatsApp = () =>
    openExternal(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`, true);

  const shareFacebook = () => {
    const url = `${PRODUCTION_WEB_ORIGIN}?ref=${referralCode}`;
    openExternal(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(shareMessage)}`,
      true,
    );
  };

  const shareLink = async () => {
    const url = `${PRODUCTION_WEB_ORIGIN}?ref=${referralCode}`;
    const shareData = { title: 'Join me on HabTastic ⚡', text: `Use my code ${referralCode}`, url };
    try {
      if (typeof navigator.share === 'function') {
        if (!navigator.canShare || navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${shareMessage}\n${url}`);
      toast.success('Link copied!');
    } catch {
      toast.error('Could not share. Copy your code manually.');
    }
  };

  const shareEmail = () => {
    const subject = 'Join me on HabTastic ⚡';
    openExternal(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(shareMessage)}`, false);
  };

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background relative">
      {celebrate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="relative gradient-orange rounded-card px-8 py-7 text-center shadow-2xl max-w-[300px] glow-accent"
          >
            <motion.div
              animate={{ rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 1.2, repeat: 2 }}
              className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/25 flex items-center justify-center"
            >
              <PartyPopper className="w-8 h-8 text-white" />
            </motion.div>
            <p className="text-[11px] uppercase font-bold tracking-widest text-white/80 mb-1">
              Milestone Unlocked
            </p>
            <p className="text-h2 font-extrabold text-white mb-1">{celebrate.badge}</p>
            <p className="text-caption text-white/90">
              {celebrate.count} qualified paid referral{celebrate.count > 1 ? 's' : ''} — reward added!
            </p>
            {[...Array(8)].map((_, i) => (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                animate={{
                  x: Math.cos((i / 8) * Math.PI * 2) * 110,
                  y: Math.sin((i / 8) * Math.PI * 2) * 110,
                  opacity: 0,
                  scale: 1.4,
                }}
                transition={{ duration: 1.6, delay: 0.1, ease: 'easeOut' }}
                className="absolute top-1/2 left-1/2 text-2xl"
              >
                ✨
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-secondary/60 transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-h1 text-foreground">Invite & Earn</h1>
      </div>

      {(statsError || historyError) && (
        <div
          role="alert"
          className="mb-5 rounded-card border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3 shadow-card"
        >
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-body text-foreground">
              We couldn't load your referrals
            </p>
            <p className="text-caption text-muted-foreground mt-0.5">
              {statsError || historyError}
            </p>
          </div>
          <Button
            onClick={() => {
              refetchStats();
              refetchHistory();
            }}
            className="h-9 px-3 rounded-btn text-caption"
            variant="secondary"
          >
            Retry
          </Button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="gradient-orange rounded-card p-6 mb-6 shadow-card relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-white" />
            <span className="font-bold text-white text-body-lg">Become a HabTastic AI Legend</span>
          </div>
          <p className="text-white/85 text-body mb-4 leading-snug">
            Invite new users with your Referral Code. Premium rewards are granted only after server-verified qualifying referrals; any XP and points bonuses follow the current server configuration.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-white/20 backdrop-blur-sm rounded-input px-4 py-3 font-mono text-white text-body-lg font-bold tracking-wider text-center">
              {referralCode || '...'}
            </div>
            <Button
              onClick={copyCode}
              className="bg-white/20 hover:bg-white/30 text-white border-0 rounded-btn h-12 w-12 p-0"
            >
              {codeCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </motion.div>

      <ReferralLinkCopyCard referralCode={referralCode} userName={profile?.name} />
      <ReferralLiveStatus />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="glass rounded-card p-5 mb-6 shadow-card"
      >
        <div className="flex items-center gap-2 mb-3">
          <Medal className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-h3 text-foreground">Code Performance</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="text-center rounded-input bg-secondary/60 py-3">
            <p className="text-h2 font-bold text-foreground">{referralCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Signups</p>
          </div>
          <div className="text-center rounded-input bg-accent/10 py-3">
            <p className="text-h2 font-bold text-accent">{paidReferralCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Paid friends</p>
          </div>
          <div className="text-center rounded-input bg-primary/10 py-3">
            <p className="text-h2 font-bold text-primary">{totalReferralXp.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Referral XP</p>
          </div>
          <div className="text-center rounded-input bg-secondary/60 py-3">
            <p className="text-h2 font-bold text-foreground">{referralPointsBalance.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Reward points</p>
          </div>
          <div className="text-center rounded-input bg-accent/10 py-3">
            <p className="text-h2 font-bold text-accent">{totalDaysEarned}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Premium days earned</p>
          </div>
          <div className="text-center rounded-input bg-primary/10 py-3">
            <p className="text-h2 font-bold text-primary">
              {referralCount > 0 ? Math.round((paidReferralCount / referralCount) * 100) : 0}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Conversion</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/referral/history')}
          className="mt-3 w-full text-caption text-primary font-semibold hover:underline flex items-center justify-center gap-1"
        >
          <History className="w-3.5 h-3.5" />
          View full signup history
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-card p-4 mb-6 bg-primary/10 border border-primary/20 flex gap-3"
      >
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-caption text-foreground mb-0.5">Reward configuration</p>
          <p className="text-caption text-muted-foreground leading-snug">
            Premium-day milestones use HabTastic's existing verified-payment checks. Referral XP and reward-point bonuses are configurable on the server and remain set to zero until their values are approved.
          </p>
        </div>
      </motion.div>

      {(() => {
        const referralLink = referralCode
          ? `${PRODUCTION_WEB_ORIGIN}?ref=${referralCode}`
          : PRODUCTION_WEB_ORIGIN;
        const dashboardNextMilestone =
          MILESTONES.find((m) => paidReferralCount < m.count) ?? MILESTONES[MILESTONES.length - 1];
        const dashboardRemaining = Math.max(dashboardNextMilestone.count - paidReferralCount, 0);
        const nextProgress = Math.min((paidReferralCount / dashboardNextMilestone.count) * 100, 100);
        const unlockedRewards = MILESTONES.filter((m) => paidReferralCount >= m.count);
        const copyLink = () => {
          navigator.clipboard.writeText(referralLink).then(
            () => toast.success('Referral link copied!'),
            () => toast.error('Could not copy link'),
          );
        };
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-card p-5 mb-6 shadow-card"
          >
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-h3 text-foreground">Your Referral Dashboard</h3>
            </div>

            <div className="space-y-2 mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Your code</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-secondary/60 rounded-input px-3 py-2 font-mono text-body font-bold text-foreground tracking-wider">
                    {referralCode || '...'}
                  </div>
                  <Button onClick={copyCode} size="sm" variant="secondary" className="rounded-btn h-9 px-3">
                    {codeCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Your link</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-secondary/60 rounded-input px-3 py-2 text-caption text-foreground truncate">
                    {referralLink}
                  </div>
                  <Button onClick={copyLink} size="sm" variant="secondary" className="rounded-btn h-9 px-3">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-input bg-accent/10 border border-accent/30 p-3 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-caption font-semibold text-foreground flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-accent" />
                  Next: {dashboardNextMilestone.badge}
                </span>
                <span className="text-caption font-bold text-accent">
                  {paidReferralCount} / {dashboardNextMilestone.count}
                </span>
              </div>
              <Progress value={nextProgress} className="h-2 mb-2" />
              <p className="text-caption text-muted-foreground">
                {dashboardRemaining === 0 ? (
                  <>You've unlocked every referral Premium milestone! 🏆</>
                ) : (
                  <>
                    <strong className="text-foreground">{dashboardRemaining}</strong> more qualified paid referral
                    {dashboardRemaining > 1 ? 's' : ''} to unlock{' '}
                    <strong className="text-foreground">{dashboardNextMilestone.label}</strong>
                  </>
                )}
              </p>
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Rewards earned</p>
              {unlockedRewards.length === 0 ? (
                <p className="text-caption text-muted-foreground italic">
                  No Premium reward yet — your first milestone unlocks at 1 qualified paid referral for 7 days of Premium.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {unlockedRewards.map((m) => (
                    <div key={m.count} className="flex items-center gap-2 text-caption text-foreground">
                      <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                      <span className="font-semibold">{m.badge}:</span>
                      <span className="text-muted-foreground truncate">{m.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/40">
                <div>
                  <p className="text-h3 font-bold text-primary">{totalDaysEarned}</p>
                  <p className="text-[11px] text-muted-foreground">Premium days earned</p>
                </div>
                <div>
                  <p className="text-h3 font-bold text-accent">{unlockedRewards.length}</p>
                  <p className="text-[11px] text-muted-foreground">Milestones unlocked</p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })()}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass rounded-card p-5 mb-6 shadow-card"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-accent" />
            <span className="font-semibold text-body text-foreground">Your Legend Progress</span>
          </div>
          <span className="text-h3 font-bold text-accent">{paidReferralCount} / {MAX_TIER}</span>
        </div>
        <Progress value={overallProgress} className="h-3 mb-3" />
        <p className="font-mono text-caption text-muted-foreground mb-1 tracking-tight">
          [{blocks}] {paidReferralCount} / {MAX_TIER}
        </p>
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/40">
          <div className="text-center rounded-input bg-[hsl(var(--accent))]/10 py-2">
            <div className="flex items-center justify-center gap-1 text-accent">
              <Crown className="w-3.5 h-3.5" />
              <p className="text-h3 font-bold">{paidReferralCount}</p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Paid friends</p>
          </div>
          <div className="text-center rounded-input bg-primary/10 py-2">
            <div className="flex items-center justify-center gap-1 text-primary">
              <Trophy className="w-3.5 h-3.5" />
              <p className="text-h3 font-bold">{unlockedMilestones.length}</p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tiers unlocked</p>
          </div>
          <div className="text-center rounded-input bg-secondary/60 py-2">
            <p className="text-h3 font-bold text-foreground">{totalDaysEarned}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Premium days</p>
          </div>
        </div>

        {remainingToNext > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-input bg-gradient-to-r from-accent/15 to-primary/15 border border-accent/30 p-3 flex items-center gap-3"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1], rotate: [0, -8, 8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className="w-9 h-9 rounded-full bg-accent/25 flex items-center justify-center flex-shrink-0"
            >
              <Gift className="w-4 h-4 text-accent" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <p className="text-caption font-semibold text-foreground">
                {remainingToNext} more to <span className="text-accent">{nextMilestone.badge}</span>
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{nextMilestone.label}</p>
            </div>
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-2.5 mb-6"
      >
        <button
          onClick={copyCode}
          className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card hover:scale-[0.97] active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center">
            {codeCopied ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5 text-accent" />}
          </div>
          <span className="text-[11px] font-medium text-foreground">Copy Code</span>
        </button>
        <button
          onClick={shareWhatsApp}
          className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card hover:scale-[0.97] active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-[hsl(142,70%,45%)]/15 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-[hsl(142,70%,45%)]" />
          </div>
          <span className="text-[11px] font-medium text-foreground">WhatsApp</span>
        </button>
        <button
          onClick={shareFacebook}
          className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card hover:scale-[0.97] active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-[hsl(221,83%,53%)]/15 flex items-center justify-center">
            <Facebook className="w-5 h-5 text-[hsl(221,83%,53%)]" />
          </div>
          <span className="text-[11px] font-medium text-foreground">Facebook</span>
        </button>
        <button
          onClick={shareLink}
          className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card hover:scale-[0.97] active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <span className="text-[11px] font-medium text-foreground">Share Link</span>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-accent" />
          <h3 className="font-semibold text-h3 text-foreground">Reward Milestones</h3>
        </div>
        <div className="space-y-3">
          {MILESTONES.map((m, i) => {
            const unlocked = paidReferralCount >= m.count;
            const progress = Math.min((paidReferralCount / m.count) * 100, 100);
            return (
              <motion.div
                key={m.count}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className={`glass rounded-card p-4 shadow-card transition-all ${
                  unlocked ? 'border-2 border-accent/40 glow-accent' : 'border border-border/40'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${
                      unlocked ? 'bg-accent/20' : 'bg-secondary'
                    }`}
                  >
                    {unlocked ? <Crown className="w-6 h-6 text-accent" /> : m.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-bold text-body text-foreground">
                        {m.count} Qualified Paid Referral{m.count > 1 ? 's' : ''}
                      </p>
                      {unlocked && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-accent bg-accent/15 px-2 py-0.5 rounded-full">
                          Unlocked
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-muted-foreground">{m.badge}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${unlocked ? 'bg-accent/20 text-accent' : 'bg-secondary text-muted-foreground'}`}>
                    <Crown className="w-3 h-3" /> {m.lifetime ? 'Lifetime' : `${m.bonusDays}d`} Premium
                  </span>
                  {m.bonusXP > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${unlocked ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                      <Zap className="w-3 h-3" /> {m.bonusXP.toLocaleString()} XP
                    </span>
                  )}
                  {m.bonusCoins > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${unlocked ? 'bg-[hsl(var(--accent))]/20 text-accent' : 'bg-secondary text-muted-foreground'}`}>
                      <Coins className="w-3 h-3" /> {m.bonusCoins.toLocaleString()}
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5 mb-3 pl-1">
                  {m.rewards.map((r) => (
                    <li key={r} className="flex items-start gap-2 text-caption text-foreground/90">
                      <Sparkles className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${unlocked ? 'text-accent' : 'text-muted-foreground'}`} />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>

                <Progress value={progress} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
                  {Math.min(paidReferralCount, m.count)} / {m.count}
                </p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-card p-5 mb-6 shadow-card"
      >
        <div className="flex items-center gap-2 mb-4">
          <Flame className="w-5 h-5 text-accent" />
          <h3 className="font-semibold text-h3 text-foreground">Top Referrers This Month</h3>
        </div>
        {topReferrers.length === 0 ? (
          <p className="text-caption text-muted-foreground text-center py-6">
            Be the first legend this month. Invite a friend to take the #1 spot! 🚀
          </p>
        ) : (
          <div className="space-y-2">
            {topReferrers.map((r, i) => {
              const isMe = r.user_id === user?.id;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
              return (
                <div
                  key={r.user_id}
                  className={`flex items-center gap-3 p-2.5 rounded-input transition-colors ${
                    isMe ? 'bg-accent/15 border border-accent/30' : 'bg-secondary/40'
                  }`}
                >
                  <div className="w-7 text-center font-bold text-body text-foreground">
                    {medal ?? `#${i + 1}`}
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {visibleAvatarUrl(r.avatar_url) ? (
                      <img loading="lazy" decoding="async" src={visibleAvatarUrl(r.avatar_url) ?? undefined} alt={r.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <Medal className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-caption text-foreground truncate">
                      {r.display_name}
                      {isMe && <span className="text-accent ml-1">(You)</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-accent font-bold">
                    <span className="text-body">{r.paid_referrals}</span>
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="glass rounded-card p-5 mb-6 shadow-card"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-h3 text-foreground">Referral History</h3>
          </div>
          {history.length > 3 && (
            <button
              onClick={() => navigate('/referral/history')}
              className="text-caption text-primary hover:underline"
            >
              View all
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-caption text-muted-foreground text-center py-4">
            No referrals yet. Share your code to see them appear here! 🚀
          </p>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 3).map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 p-2.5 rounded-input bg-secondary/40"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${h.purchase_completed ? 'bg-accent/20' : 'bg-secondary'}`}>
                  {h.purchase_completed ? (
                    <Crown className="w-4 h-4 text-accent" />
                  ) : (
                    <Medal className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-caption text-foreground truncate">
                    {h.friend_name || 'New friend'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {h.purchase_completed && h.reward_days ? ` · +${h.reward_days}d Premium` : ' · Pending Premium'}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${h.purchase_completed ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground'}`}>
                  {h.purchase_completed ? 'Premium' : 'Joined'}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="grid grid-cols-2 gap-3 mb-6"
      >
        <button
          onClick={shareEmail}
          className="glass rounded-card p-3 flex items-center justify-center gap-2 shadow-card hover:scale-[0.98] active:scale-95 transition-transform"
        >
          <Mail className="w-4 h-4 text-blue-500" />
          <span className="text-caption font-medium text-foreground">Email</span>
        </button>
        <button
          onClick={() => navigate('/referral/history')}
          className="glass rounded-card p-3 flex items-center justify-center gap-2 shadow-card hover:scale-[0.98] active:scale-95 transition-transform"
        >
          <History className="w-4 h-4 text-foreground" />
          <span className="text-caption font-medium text-foreground">History</span>
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Button
          onClick={shareLink}
          className="w-full gradient-orange text-white rounded-btn h-14 text-body-lg font-semibold shadow-card gap-2 glow-accent"
        >
          <Gift className="w-5 h-5" />
          Invite Friends Now
        </Button>
        <button
          onClick={() => navigate('/referral/rules')}
          className="mt-4 w-full text-center text-caption text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Read program rules & regulations
        </button>
      </motion.div>
    </div>
  );
}
