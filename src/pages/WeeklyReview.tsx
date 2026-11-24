import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Sunrise,
  Moon,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useWeeklyAIReview } from '@/hooks/useWeeklyAIReview';
import PremiumGate from '@/components/PremiumGate';
import { FEATURES } from '@/lib/featureGating';

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function WeeklyReview() {
  return (
    <PremiumGate
      feature={FEATURES.ADVANCED_ANALYTICS}
      fallbackTitle="Weekly AI Review"
      fallbackDescription="Your previous reviews and habit history are saved. Activate Premium to view new AI insights and continue where you stopped."
    >
      <WeeklyReviewContent />
    </PremiumGate>
  );
}

function WeeklyReviewContent() {
  const navigate = useNavigate();
  const { review, loading, generating, generate } = useWeeklyAIReview();

  return (
    <div className="min-h-screen pb-24 bg-background">
      <div className="px-5 pt-10 pb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-1 text-caption text-primary font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          Weekly AI Review
        </div>
        <button
          type="button"
          onClick={() => generate(true)}
          disabled={generating}
          className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center disabled:opacity-50"
          aria-label="Regenerate review"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="px-5">
        <h1 className="text-h1 text-foreground">This week with Winston</h1>
        {review && (
          <p className="text-caption text-muted-foreground mt-1">
            Week of {formatWeekRange(review.week_start)}
          </p>
        )}
      </div>

      <div className="px-5 mt-6 space-y-4">
        {loading && !review && (
          <div className="glass rounded-card p-6 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        )}

        {!loading && !review && (
          <div className="glass rounded-card p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <p className="text-body font-semibold text-foreground">
              No review yet
            </p>
            <p className="text-caption text-muted-foreground mt-1 mb-4">
              Track a few habits this week and Winston will pull together your insights.
            </p>
            <button
              type="button"
              onClick={() => generate(true)}
              disabled={generating}
              className="px-4 py-2 rounded-btn gradient-primary text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-60"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate now
            </button>
          </div>
        )}

        {review && (
          <>
            {/* Winston intro */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-card p-5 shadow-card border border-primary/15 flex items-start gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-2xl" aria-hidden>🦊</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption text-muted-foreground">Winston says</p>
                <p className="text-body font-semibold text-foreground leading-snug mt-0.5">
                  {review.summary}
                </p>
              </div>
            </motion.div>

            {/* Performance */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass rounded-card p-5 shadow-card"
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-body font-bold text-foreground">📊 Performance</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-caption text-muted-foreground">Completion</p>
                  <p className="text-h2 font-bold text-foreground">{review.completion_rate}%</p>
                  {review.prev_completion_rate != null && (
                    <p
                      className={`text-caption font-semibold ${
                        review.completion_rate - review.prev_completion_rate >= 0
                          ? 'text-primary'
                          : 'text-destructive'
                      }`}
                    >
                      {review.completion_rate - review.prev_completion_rate >= 0 ? '+' : ''}
                      {Math.round(review.completion_rate - review.prev_completion_rate)}% vs last week
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-caption text-muted-foreground">Best day</p>
                  <p className="text-h2 font-bold text-foreground truncate">
                    {review.best_day || '—'}
                  </p>
                  {review.worst_day && (
                    <p className="text-caption text-muted-foreground">
                      Toughest: {review.worst_day}
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-secondary/50 p-3 flex items-center gap-2">
                  <Sunrise className="w-4 h-4 text-yellow-500" />
                  <div>
                    <p className="text-caption text-muted-foreground">Morning</p>
                    <p className="text-body font-bold text-foreground">{review.morning_count}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3 flex items-center gap-2">
                  <Moon className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-caption text-muted-foreground">Evening</p>
                    <p className="text-body font-bold text-foreground">{review.evening_count}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Weak points */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-card p-5 shadow-card"
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-orange-500" />
                <p className="text-body font-bold text-foreground">⚠️ Weak points</p>
              </div>
              <p className="text-body text-muted-foreground leading-relaxed">{review.weak_points}</p>
            </motion.div>

            {/* Suggestion */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass rounded-card p-5 shadow-card border border-primary/15"
            >
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" />
                <p className="text-body font-bold text-foreground">💡 Improvement suggestion</p>
              </div>
              <p className="text-body text-foreground leading-relaxed">{review.suggestion}</p>
            </motion.div>

            <button
              type="button"
              onClick={() => navigate('/coach')}
              className="w-full py-3 rounded-btn gradient-primary text-white font-semibold flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Talk to Winston about this
            </button>
          </>
        )}
      </div>
    </div>
  );
}
