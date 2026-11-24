import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Play, Sparkles, X } from 'lucide-react';

export interface WalkthroughChapter {
  id: string;
  stepNumber: number;
  label: string;
  timeLabel: string;
  startSec: number;
  endSec: number;
}

export const WALKTHROUGH_CHAPTERS: WalkthroughChapter[] = [
  { id: 'overview', stepNumber: 1, label: '5-Tab Overview', timeLabel: '0:00', startSec: 0, endSec: 11.4 },
  { id: 'quests', stepNumber: 2, label: "Today's Quests", timeLabel: '0:11', startSec: 11.4, endSec: 22.8 },
  { id: 'habits', stepNumber: 3, label: 'Habits & Shields', timeLabel: '0:23', startSec: 22.8, endSec: 35.15 },
  { id: 'winston', stepNumber: 4, label: 'Winston AI', timeLabel: '0:35', startSec: 35.15, endSec: 45.9 },
  { id: 'savings', stepNumber: 5, label: 'Savings & Progress', timeLabel: '0:46', startSec: 45.9, endSec: 57.6 },
  { id: 'trial', stepNumber: 6, label: 'Trial & Free Plan', timeLabel: '0:58', startSec: 57.6, endSec: 70 },
];

export const EXPLAINER_DISMISSED_STORAGE_KEY = 'habtastic_explainer_card_dismissed_v1';

interface HowItWorksVideoProps {
  autoPlay?: boolean;
  compact?: boolean;
  showCaptions?: boolean;
  className?: string;
}

export default function HowItWorksVideo({
  autoPlay = false,
  compact = false,
  showCaptions = true,
  className = '',
}: HowItWorksVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasStarted, setHasStarted] = useState(Boolean(autoPlay));
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!autoPlay || !videoRef.current) return;
    setHasStarted(true);
    const playPromise = videoRef.current.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        setHasStarted(false);
      });
    }
  }, [autoPlay]);

  const handlePlayOverlayClick = () => {
    const el = videoRef.current;
    setHasStarted(true);
    if (!el) return;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Keep native controls visible so user can tap Play directly if autoplay was blocked
      });
    }
  };

  const handleJumpToChapter = (index: number) => {
    const chapter = WALKTHROUGH_CHAPTERS[index];
    if (!chapter) return;
    setActiveChapterIdx(index);
    setHasStarted(true);
    const el = videoRef.current;
    if (!el) return;
    try {
      el.currentTime = chapter.startSec;
    } catch {
      // Metadata not yet loaded; load then seek once metadata arrives
      const onLoaded = () => {
        el.currentTime = chapter.startSec;
        el.removeEventListener('loadedmetadata', onLoaded);
      };
      el.addEventListener('loadedmetadata', onLoaded);
    }
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;
    const t = el.currentTime;
    const idx = WALKTHROUGH_CHAPTERS.findIndex((c) => t >= c.startSec && t < c.endSec);
    if (idx !== -1 && idx !== activeChapterIdx) {
      setActiveChapterIdx(idx);
    }
  };

  return (
    <div
      data-testid="how-it-works-video"
      className={`rounded-3xl border border-border/80 bg-card shadow-xl shadow-primary/5 overflow-hidden ${className}`}
    >
      {/* Top header strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3.5 border-b border-border/60 bg-secondary/25">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-display font-bold text-foreground truncate">
              How HabTastic AI Works
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              Step-by-step guided tour with Winston AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Watched
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            <Clock className="w-3 h-3 text-primary" aria-hidden="true" /> 1:09{showCaptions ? ' · Captions' : ''}
          </span>
        </div>
      </div>

      {/* 16:9 Native Video Container */}
      <div className="relative aspect-video w-full bg-slate-950">
        <video
          ref={videoRef}
          src="/videos/how-habtastic-works.mp4"
          poster="/videos/how-habtastic-works-poster.jpg"
          preload="none"
          playsInline
          controls={hasStarted}
          onPlay={() => setHasStarted(true)}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setCompleted(true)}
          aria-label="How HabTastic AI works walkthrough video"
          className="h-full w-full object-contain bg-slate-950"
        >
          Your browser does not support HTML5 video.
          {showCaptions && (
            <track
              kind="captions"
              src="/videos/how-habtastic-works.vtt"
              srcLang="en"
              label="English"
              default
            />
          )}
        </video>

        {!hasStarted && (
          <button
            type="button"
            onClick={handlePlayOverlayClick}
            aria-label="Play How HabTastic Works walkthrough video"
            className="group absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-slate-950/20 p-4 text-center transition-colors hover:bg-slate-950/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_36px_hsl(var(--primary)/0.65)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
              <Play className="h-7 w-7 sm:h-8 sm:w-8 fill-current ml-1" aria-hidden="true" />
            </span>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-lg">
              Watch 69-second app tour{showCaptions ? ' · Voiceover + Captions' : ''}
            </span>
          </button>
        )}
      </div>

      {/* Interactive Chapter Jump Chips */}
      <div className={compact ? 'p-3 sm:p-4 bg-card' : 'p-4 sm:p-5 bg-card'}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
          Jump to a chapter
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible no-scrollbar">
          {WALKTHROUGH_CHAPTERS.map((chapter, idx) => {
            const isActive = hasStarted && idx === activeChapterIdx;
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => handleJumpToChapter(idx)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors border ${
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-secondary/50 hover:bg-secondary text-foreground border-border/60'
                }`}
              >
                <span className={isActive ? 'text-primary-foreground/90' : 'text-primary font-bold'}>
                  {chapter.stepNumber}.
                </span>
                <span>{chapter.label}</span>
                <span
                  className={`text-[10px] ${
                    isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}
                >
                  {chapter.timeLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface HowItWorksHomeCardProps {
  onWatch: () => void;
  onDismiss: () => void;
}

export function HowItWorksHomeCard({ onWatch, onDismiss }: HowItWorksHomeCardProps) {
  return (
    <div
      data-testid="dashboard-explainer-card"
      className="relative rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/12 via-card to-secondary/30 p-3.5 sm:p-4 shadow-card overflow-hidden"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide walkthrough card"
        className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 pr-6 sm:pr-7">
        <button
          type="button"
          onClick={onWatch}
          aria-label="Watch how HabTastic works video"
          className="group relative w-full sm:w-40 aspect-video rounded-xl overflow-hidden border border-border/70 bg-slate-950 shrink-0"
        >
          <img
            src="/videos/how-habtastic-works-poster.jpg"
            alt="How HabTastic Works video preview"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
          <span className="absolute inset-0 bg-slate-950/35 flex items-center justify-center">
            <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
            </span>
          </span>
          <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
            1:09
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> App Walkthrough
          </div>
          <h3 className="mt-0.5 font-display font-bold text-base sm:text-lg text-foreground leading-snug">
            See how HabTastic AI works in 1 minute
          </h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Tour Today&apos;s Quests, Streak Shields, Winston AI voice coaching, Money Saver &amp; your Daily Chest.
          </p>
          <button
            type="button"
            onClick={onWatch}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm active:scale-[0.98] transition-transform"
          >
            <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            Watch walkthrough
          </button>
        </div>
      </div>
    </div>
  );
}

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How HabTastic AI Works video walkthrough"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-background/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video walkthrough"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-md hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" /> Close
          </button>
        </div>
        <HowItWorksVideo autoPlay compact />
      </div>
    </div>
  );
}
