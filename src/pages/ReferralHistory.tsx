import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, Clock, User, Gift, Loader2, AlertTriangle } from 'lucide-react';
import { useReferralHistory } from '@/hooks/useReferralHistory';
import { useReferral } from '@/hooks/useReferral';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReferralHistory() {
  const navigate = useNavigate();
  const { history, rewardHistory, loading, error: historyError, refetch: refetchHistory } = useReferralHistory();
  const { totalDaysEarned, paidReferralCount, referralCount, totalReferralXp, referralPointsBalance, statsError, refetchStats } = useReferral();

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-secondary/60 transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-h1 text-foreground">Referral History</h1>
      </div>

      {/* Summary */}
      <div className="glass rounded-card p-5 mb-5 shadow-card grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-h2 text-foreground font-bold">{referralCount}</p>
          <p className="text-caption text-muted-foreground">Invited</p>
        </div>
        <div className="text-center">
          <p className="text-h2 text-accent font-bold">{paidReferralCount}</p>
          <p className="text-caption text-muted-foreground">Upgraded</p>
        </div>
        <div className="text-center">
          <p className="text-h2 text-primary font-bold">{totalDaysEarned}</p>
          <p className="text-caption text-muted-foreground">Days Earned</p>
        </div>
        <div className="text-center">
          <p className="text-h2 text-foreground font-bold">{totalReferralXp}</p>
          <p className="text-caption text-muted-foreground">Referral XP</p>
        </div>
        <div className="text-center">
          <p className="text-h2 text-foreground font-bold">{referralPointsBalance}</p>
          <p className="text-caption text-muted-foreground">Reward points</p>
        </div>
      </div>

      {(historyError || statsError) && (
        <div
          role="alert"
          className="mb-5 rounded-card border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3 shadow-card"
        >
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-body text-foreground">
              We couldn't load your referral history
            </p>
            <p className="text-caption text-muted-foreground mt-0.5">
              {historyError || statsError}
            </p>
          </div>
          <button
            onClick={() => {
              refetchHistory();
              refetchStats();
            }}
            className="h-9 px-3 rounded-btn text-caption font-semibold bg-secondary hover:bg-secondary/80 text-foreground"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : historyError ? null : history.length === 0 && rewardHistory.length === 0 ? (
        <div className="glass rounded-card p-10 text-center shadow-card">
          <Gift className="w-10 h-10 text-primary mx-auto mb-3" />
          <p className="font-semibold text-body-lg text-foreground">No referrals yet</p>
          <p className="text-caption text-muted-foreground mt-1">
            Share your code from the Invite & Earn page to get started.
          </p>
          <button
            onClick={() => navigate('/referral')}
            className="mt-5 px-5 py-2.5 rounded-btn gradient-primary text-white font-semibold text-sm"
          >
            Share my code
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item, i) => {
            const upgraded = item.purchase_completed;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`glass rounded-card p-4 shadow-card flex items-center gap-3 border ${
                  upgraded ? 'border-accent/30' : 'border-border/40'
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                    upgraded ? 'bg-accent/15 text-accent' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {upgraded ? <Crown className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-body text-foreground truncate">
                    {item.friend_name || 'Friend joined'}
                  </p>
                  <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>Joined {formatDate(item.created_at)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {upgraded ? (
                    <>
                      <span className="inline-block px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase tracking-wider">
                        Qualified
                      </span>
                      {item.rewarded && item.reward_days > 0 && (
                        <p className="text-caption text-primary font-semibold mt-1">
                          +{item.reward_days} days
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
                      Pending
                    </span>
                  )}

                </div>

              </motion.div>
            );
          })}
        </div>
      )}

      {rewardHistory.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Reward history</h2>
          {rewardHistory.map((reward) => (
            <div key={reward.id} className="glass rounded-card p-4 shadow-card flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-body text-foreground">
                  {reward.reward_kind === 'signup' ? 'Signup reward' : `${reward.milestone} qualified referrals`}
                </p>
                <p className="text-caption text-muted-foreground">
                  Granted {formatDate(reward.granted_at)}
                </p>
                <p className="text-caption text-muted-foreground">
                  {reward.xp_bonus > 0 ? `+${reward.xp_bonus} XP · ` : ''}
                  {reward.points_bonus > 0 ? `+${reward.points_bonus} points · ` : ''}
                  {reward.reward_days > 0 ? `+${reward.reward_days} Premium days` : 'Milestone recorded'}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}
    </motion.div>
  );
}
