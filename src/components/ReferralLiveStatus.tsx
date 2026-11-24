import { motion } from 'framer-motion';
import { Activity, Check, Clock, Crown, Sparkles, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useReferralHistory, type ReferralHistoryItem } from '@/hooks/useReferralHistory';

interface Step {
  key: string;
  label: string;
  done: boolean;
  icon: React.ReactNode;
  hint?: string;
}

function buildSteps(h: ReferralHistoryItem): Step[] {
  return [
    {
      key: 'joined',
      label: 'New user joined',
      done: true,
      icon: <Check className="w-3.5 h-3.5" />,
      hint: new Date(h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    },
    {
      key: 'qualified',
      label: 'Verified paid Premium',
      done: h.purchase_completed,
      icon: <Crown className="w-3.5 h-3.5" />,
      hint: h.purchase_completed ? 'Verified' : 'Waiting on qualifying upgrade',
    },
    {
      key: 'milestone',
      label: 'Milestone reward',
      done: h.rewarded,
      icon: <Sparkles className="w-3.5 h-3.5" />,
      hint: h.rewarded && h.reward_days > 0 ? `+${h.reward_days} Premium days` : h.rewarded ? 'Reward recorded' : 'Not yet unlocked',
    },
  ];
}

export default function ReferralLiveStatus() {
  const { history, loading } = useReferralHistory();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="glass rounded-card p-5 mb-6 shadow-card"
    >
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-h3 text-foreground">Live Verification & Payouts</h3>
        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
      </div>
      <p className="text-caption text-muted-foreground mb-4">
        Status of new-user referrals and server-verified Premium qualification. Referral codes do not create friendships.
      </p>

      {loading ? (
        <p className="text-caption text-muted-foreground text-center py-6">Loading…</p>
      ) : history.length === 0 ? (
        <div className="text-center py-6">
          <ShieldCheck className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
          <p className="text-caption text-muted-foreground">
            No referrals yet — share your code and watch this update live.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.slice(0, 6).map((h) => {
            const steps = buildSteps(h);
            const done = steps.filter((s) => s.done).length;
            const pct = Math.round((done / steps.length) * 100);
            return (
              <div key={h.id} className="rounded-input bg-secondary/40 border border-border/40 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-semibold text-caption text-foreground truncate flex-1">
                    {h.friend_name || 'Friend'}
                  </p>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      h.purchase_completed
                        ? 'bg-accent/15 text-accent'
                        : 'bg-primary/15 text-primary'
                    }`}
                  >
                    {done}/{steps.length} · {pct}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {steps.map((s) => (
                    <div
                      key={s.key}
                      title={`${s.label} — ${s.hint || ''}`}
                      className={`h-1.5 rounded-full ${
                        s.done ? 'bg-accent' : 'bg-secondary'
                      }`}
                    />
                  ))}
                </div>
                <ul className="space-y-1">
                  {steps.map((s) => (
                    <li key={s.key} className="flex items-center gap-2 text-[11px]">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          s.done ? 'bg-accent/20 text-accent' : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {s.done ? s.icon : <Clock className="w-3 h-3" />}
                      </span>
                      <span className={s.done ? 'text-foreground' : 'text-muted-foreground'}>
                        {s.label}
                      </span>
                      {s.hint && (
                        <span className="ml-auto text-[10px] text-muted-foreground">{s.hint}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {history.length > 6 && (
            <p className="text-[11px] text-muted-foreground text-center pt-1">
              +{history.length - 6} more · view full history for details
            </p>
          )}
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground pt-2 border-t border-border/40">
            <AlertTriangle className="w-3 h-3 mt-0.5 text-muted-foreground/70 flex-shrink-0" />
            <span>
              Payouts are audited automatically. Flagged referrals are reviewed by our team before rewards clear.
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
