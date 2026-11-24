import { PRODUCTION_WEB_ORIGIN } from '@/lib/appOrigin';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Copy, Check, Share2, Sparkles, MessageSquare, Mail, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { useReferral } from '@/hooks/useReferral';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const PRODUCTION_INVITE_URL = PRODUCTION_WEB_ORIGIN;

/**
 * Resolve the invite base URL so referral links keep working across
 * staging, preview (id-preview-*.lovable.app), custom domains, and prod.
 *
 * Priority:
 *   1. VITE_INVITE_BASE_URL (build-time override per environment)
 *   2. Current window.location.origin when it looks like a real host
 *      (custom domain, *.habtastic.com, or any *.lovable.app preview)
 *   3. Production fallback
 */
function getInviteBaseUrl(): string {
  const envUrl = (import.meta)?.env?.VITE_INVITE_BASE_URL as string | undefined;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(origin)) {
      return PRODUCTION_INVITE_URL;
    }
    if (/\.lovable\.app$|habtastic\.com$/i.test(window.location.hostname)) {
      return origin.replace(/\/$/, '');
    }
  }
  return PRODUCTION_INVITE_URL;
}

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Legacy clipboard fallback using a transient textarea + execCommand('copy').
 * iOS Safari requires the element to be contentEditable & a real selection range
 * for the copy command to actually succeed inside a user gesture.
 */
function legacyCopy(value: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.contentEditable = 'true';
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);

    if (isIOS()) {
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      ta.setSelectionRange(0, value.length);
    } else {
      ta.select();
    }
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function InviteEarnCard() {
  const navigate = useNavigate();
  const { referralCode, referralCount, paidReferralCount, totalDaysEarned, MILESTONES } = useReferral();
  const [copied, setCopied] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogOptionsRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const inviteUrl = referralCode ? `${getInviteBaseUrl()}?ref=${referralCode}` : '';
  const nextMilestone = MILESTONES.find((milestone) => paidReferralCount < milestone.count);
  const nextRewardCopy = nextMilestone
    ? `${nextMilestone.count - paidReferralCount} more paid referral${nextMilestone.count - paidReferralCount === 1 ? '' : 's'} to unlock ${nextMilestone.label}`
    : 'All referral Premium milestones unlocked';
  const inviteText = referralCode
    ? `I'm using HabTastic to crush my habits 💪⚡ Join me with code ${referralCode}: ${inviteUrl}`
    : '';

  const announce = (msg: string) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = msg;
  };

  const triggerSuccessBurst = () => {
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 1400);
  };

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /**
   * Robust copy helper:
   * 1. Try the modern async Clipboard API.
   * 2. If it throws (iOS Safari without HTTPS, permissions, focus issues),
   *    automatically retry with the synchronous execCommand('copy') fallback.
   * 3. Surface a single, clear error toast only if both paths fail.
   */
  const copyText = async (value: string): Promise<boolean> => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // fall through to legacy fallback (iOS quirks, permission denials)
      }
    }
    return legacyCopy(value);
  };

  const handleCopy = async (e: React.MouseEvent | React.KeyboardEvent) => {
    stop(e);
    const ok = await copyText(referralCode);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Distinct copy-style toast: neutral info + clipboard icon
      toast('📋 Code copied', {
        description: `“${referralCode}” is on your clipboard — paste it anywhere.`,
        duration: 2800,
        className: 'border-l-4 border-accent',
      });
      announce('Referral code copied to clipboard');
      triggerSuccessBurst();
    } else {
      toast.error('Could not copy', {
        description: 'Tap and hold the code to copy it manually.',
      });
    }
  };

  const handleShare = async (e: React.MouseEvent | React.KeyboardEvent) => {
    stop(e);
    const shareData = { title: 'Join me on HabTastic ⚡', text: inviteText, url: inviteUrl };

    // Prefer native share on mobile / supported browsers
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        if (!navigator.canShare || navigator.canShare(shareData)) {
          await navigator.share(shareData);
          // Distinct share-style toast: celebratory success + share icon
          toast.success('🚀 Invite sent!', {
            description: 'Qualified paid referrals count toward your next Premium milestone.',
            duration: 3200,
            className: 'border-l-4 border-success',
          });
          announce('Invite shared successfully');
          triggerSuccessBurst();
          return;
        }
      } catch (err) {
        if (err?.name === 'AbortError') return; // user cancelled
        // fall through to fallback sheet
      }
    }

    // Desktop or unsupported: open fallback sheet
    setFallbackOpen(true);
  };

  const shareVia = async (channel: 'sms' | 'email' | 'whatsapp' | 'copy', e: React.MouseEvent) => {
    stop(e);
    const encodedText = encodeURIComponent(inviteText);
    const encodedSubject = encodeURIComponent('Join me on HabTastic ⚡');

    if (channel === 'copy') {
      const ok = await copyText(inviteText);
      if (ok) {
        toast('📋 Invite copied', {
          description: 'Paste it into any chat to send your invite link.',
          duration: 2800,
          className: 'border-l-4 border-accent',
        });
        announce('Invite text copied');
        triggerSuccessBurst();
      } else {
        toast.error('Could not copy', { description: 'Try selecting the code manually.' });
      }
      setFallbackOpen(false);
      return;
    }

    let href = '';
    if (channel === 'sms') {
      // iOS uses `&`, Android uses `?` — both accept `?` in modern OS versions
      href = isIOS() ? `sms:&body=${encodedText}` : `sms:?body=${encodedText}`;
    } else if (channel === 'email') {
      href = `mailto:?subject=${encodedSubject}&body=${encodedText}`;
    } else if (channel === 'whatsapp') {
      // Build via URL API so query params are always correctly percent-encoded
      // (handles emoji, newlines, ampersands, &, #, +, =, etc. safely).
      // api.whatsapp.com is more reliable than wa.me on Android browsers and
      // doesn't 404 when WhatsApp isn't installed — it shows a download page.
      try {
        const u = new URL('https://api.whatsapp.com/send');
        u.searchParams.set('text', inviteText);
        href = u.toString();
      } catch {
        href = `https://api.whatsapp.com/send?text=${encodedText}`;
      }
    }

    if (!href) return;

    const channelLabel = channel === 'sms' ? 'Messages' : channel === 'email' ? 'Email' : 'WhatsApp';

    // Safe fallback: copy invite to clipboard + show actionable toast
    const fallbackToClipboard = async (reason: 'blocked' | 'error') => {
      const ok = await copyText(inviteText);
      toast.error(`Couldn't open ${channelLabel}`, {
        description: ok
          ? 'We copied your invite — paste it into the app instead.'
          : reason === 'blocked'
          ? 'Pop-up blocked. Allow pop-ups or use the Copy option.'
          : 'Try the Copy option to share manually.',
      });
      setFallbackOpen(false);
    };

    const hrefAllowed = (() => {
      if (channel === 'sms') return href.startsWith('sms:');
      if (channel === 'email') return href.startsWith('mailto:');
      if (channel === 'whatsapp') {
        try {
          const url = new URL(href);
          return url.protocol === 'https:' && url.hostname === 'api.whatsapp.com';
        } catch {
          return false;
        }
      }
      return false;
    })();
    if (!hrefAllowed) {
      await fallbackToClipboard('error');
      return;
    }

    try {
      if (channel === 'whatsapp') {
        // Real https URL — open in a new tab so the SPA stays mounted.
        // If pop-ups are blocked OR navigation can't be initiated, fall back
        // to clipboard so the user is never stuck on a broken share.
        const win = window.open(href, '_blank', 'noopener,noreferrer');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          await fallbackToClipboard('blocked');
          return;
        }
      } else {
        // sms: / mailto: — same-tab navigation hands off to the OS handler
        // without leaving a blank "broken page" tab behind.
        window.location.href = href;
      }

      toast.success('🚀 Opening share…', {
        description: `Sending your invite via ${channelLabel}.`,
        duration: 2800,
        className: 'border-l-4 border-success',
      });
      announce('Opening share');
      triggerSuccessBurst();
      setFallbackOpen(false);
    } catch (err) {
      await fallbackToClipboard('error');
    }
  };

  const goToReferral = () => navigate('/referral');

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // Don't hijack if focus is on a nested control
      if ((e.target as HTMLElement).closest('button, [role="button"]') !== e.currentTarget) return;
      e.preventDefault();
      goToReferral();
    }
  };

  // Auto-clear announcer after a delay so it's ready for the next message
  useEffect(() => {
    if (!shareSuccess) return;
    const t = setTimeout(() => announce(''), 2000);
    return () => clearTimeout(t);
  }, [shareSuccess]);

  // Focus management for the fallback share dialog:
  // - Remember the trigger so we can restore focus on close
  // - Auto-focus the first share option after open
  // - Restore focus to the share button when the dialog closes
  useEffect(() => {
    if (fallbackOpen) {
      previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
      const t = setTimeout(() => {
        const first = dialogOptionsRef.current?.querySelector<HTMLButtonElement>('button');
        first?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
    // On close: restore focus to the originating share button (or remembered element)
    const target = shareBtnRef.current ?? previousFocusRef.current;
    target?.focus?.();
  }, [fallbackOpen]);

  // Roving Tab focus trap inside the share-options grid.
  // Radix Dialog already handles overall trap + Escape, but this guarantees
  // Tab/Shift+Tab cycles cleanly through the 4 share options and Arrow keys
  // move between them — useful on screen readers and keyboard-only users.
  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const root = dialogOptionsRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[(currentIndex + 1 + items.length) % items.length];
      next.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === 'Tab' && currentIndex !== -1) {
      // Cycle Tab/Shift+Tab inside the grid for predictable focus
      e.preventDefault();
      const delta = e.shiftKey ? -1 : 1;
      const next = items[(currentIndex + delta + items.length) % items.length];
      next.focus();
    }
  };

  if (!referralCode) return null;

  return (
    <>
      {/* Screen-reader live region */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <motion.div
        onClick={goToReferral}
        role="button"
        tabIndex={0}
        aria-label={`Open invite referrals. Your referral code is ${referralCode.split('').join(' ')}. ${nextRewardCopy}.`}
        onKeyDown={handleCardKeyDown}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full text-left gradient-orange rounded-card p-5 shadow-card relative overflow-hidden active:scale-[0.99] transition-transform cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        {/* Success burst overlay */}
        <AnimatePresence>
          {shareSuccess && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.4 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
              aria-hidden="true"
            >
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.1, 1] }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="w-20 h-20 rounded-full bg-white/95 flex items-center justify-center shadow-2xl"
                >
                  <Check className="w-10 h-10 text-success" strokeWidth={3} />
                </motion.div>
                {/* Sparkles burst */}
                {[...Array(8)].map((_, i) => {
                  const angle = (i / 8) * Math.PI * 2;
                  return (
                    <motion.div
                      key={i}
                      initial={{ x: 0, y: 0, opacity: 1, scale: 0.5 }}
                      animate={{
                        x: Math.cos(angle) * 60,
                        y: Math.sin(angle) * 60,
                        opacity: 0,
                        scale: 1,
                      }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    >
                      <Sparkles className="w-4 h-4 text-white" />
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-white" />
              <span className="font-bold text-white text-body-lg">Invite Referrals 🎉</span>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white bg-white/20 px-2 py-1 rounded-full">
              <Sparkles className="w-3 h-3" /> Free Premium
            </span>
          </div>
          <p className="text-white/85 text-caption mb-3">
            {nextRewardCopy}
          </p>

          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex-1 bg-white/20 backdrop-blur-sm rounded-input px-4 py-2.5 font-mono text-white text-body font-bold tracking-wider text-center select-all"
              aria-label={`Referral code ${referralCode.split('').join(' ')}`}
            >
              {referralCode}
            </div>
            <Button
              onClick={handleCopy}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCopy(e); }}
              size="sm"
              className="bg-white/25 hover:bg-white/35 text-white border-0 rounded-btn h-10 w-10 p-0 shrink-0 focus-visible:ring-2 focus-visible:ring-white"
              aria-label={copied ? 'Code copied to clipboard' : 'Copy referral code to clipboard'}
              aria-pressed={copied}
            >
              <motion.span
                key={copied ? 'check' : 'copy'}
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </motion.span>
            </Button>
            <Button
              ref={shareBtnRef}
              onClick={handleShare}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleShare(e); }}
              size="sm"
              className="bg-white/25 hover:bg-white/35 text-white border-0 rounded-btn h-10 w-10 p-0 shrink-0 focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Share invite via system share"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>

          {(referralCount > 0 || totalDaysEarned > 0) && (
            <div className="flex items-center justify-between text-caption text-white/85">
              <span>{referralCount} joined · {paidReferralCount} upgraded</span>
              {totalDaysEarned > 0 && (
                <span className="font-semibold text-white">+{totalDaysEarned} days earned</span>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Fallback share sheet for desktop / unsupported browsers */}
      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent
          className="max-w-sm rounded-card"
          onClick={(e) => e.stopPropagation()}
          onEscapeKeyDown={() => setFallbackOpen(false)}
        >
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Share2 className="w-5 h-5 text-primary" />
              Share your invite
            </DialogTitle>
            <DialogDescription>
              Pick how you want to send your code <span className="font-mono font-bold text-foreground">{referralCode}</span>.
            </DialogDescription>
          </DialogHeader>

          <div
            ref={dialogOptionsRef}
            role="group"
            aria-label="Share options"
            onKeyDown={handleDialogKeyDown}
            className="grid grid-cols-2 gap-3 mt-2"
          >
            <button
              type="button"
              onClick={(e) => shareVia('sms', e)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-card bg-secondary hover:bg-secondary/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Share via SMS"
            >
              <MessageSquare className="w-6 h-6 text-primary" />
              <span className="text-sm font-semibold text-foreground">SMS</span>
            </button>
            <button
              type="button"
              onClick={(e) => shareVia('email', e)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-card bg-secondary hover:bg-secondary/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Share via Email"
            >
              <Mail className="w-6 h-6 text-accent" />
              <span className="text-sm font-semibold text-foreground">Email</span>
            </button>
            <button
              type="button"
              onClick={(e) => shareVia('whatsapp', e)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-card bg-secondary hover:bg-secondary/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Share via WhatsApp"
            >
              <MessageCircle className="w-6 h-6 text-success" />
              <span className="text-sm font-semibold text-foreground">WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={(e) => shareVia('copy', e)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-card bg-secondary hover:bg-secondary/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Copy invite link"
            >
              <Copy className="w-6 h-6 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Copy link</span>
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Tip: on mobile, the system share sheet opens automatically.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
