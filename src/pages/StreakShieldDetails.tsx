import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Clock, Calendar, Zap, Crown, Info } from 'lucide-react';
import { useStreakFreeze } from '@/hooks/useStreakFreeze';
import { useProfile } from '@/hooks/useProfile';
import { STREAK_SHIELD_RULES, getShieldCooldownDays, getShieldsUsedThisWeek } from '@/lib/streakShield';
import { Button } from '@/components/ui/button';

export default function StreakShieldDetails() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { freezesAvailable, todayFrozen, canFreeze, isPremium, useFreeze, buyFreezeWithXP } = useStreakFreeze();

  const usedDates = profile?.freeze_used_dates ?? [];
  const cooldown = getShieldCooldownDays(usedDates);
  const usedThisWeek = getShieldsUsedThisWeek(usedDates);
  const weeklyCapHit = usedThisWeek >= STREAK_SHIELD_RULES.MAX_PER_WEEK;
  const heldCapHit = freezesAvailable >= STREAK_SHIELD_RULES.MAX_HELD;

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-h1 text-foreground mb-1 flex items-center gap-2">
        <Shield className="w-6 h-6 text-primary" /> Streak Shield
      </h1>
      <p className="text-sm text-muted-foreground mb-5">Protect your streak when life gets in the way.</p>

      {/* Status hero */}
      <div className="rounded-2xl p-5 mb-5 border-2 text-center"
        style={{
          background: 'linear-gradient(135deg, hsl(190, 80%, 50%, 0.15), hsl(210, 90%, 60%, 0.05))',
          borderColor: 'hsl(190, 80%, 50%, 0.4)',
        }}
      >
        <div className="text-5xl mb-2">🛡️</div>
        <p className="text-3xl font-extrabold text-foreground">{freezesAvailable}</p>
        <p className="text-sm text-muted-foreground">shields available</p>
        {todayFrozen && (
          <p className="mt-2 text-xs font-semibold text-primary">✅ Active today — your streak is safe</p>
        )}
      </div>

      {/* Rules */}
      <div className="glass rounded-card p-4 mb-5 shadow-card space-y-3">
        <p className="text-sm font-bold text-foreground flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" /> How it works
        </p>
        <Rule
          icon={<Calendar className="w-4 h-4" />}
          label="Max held"
          value={`${STREAK_SHIELD_RULES.MAX_HELD} shields at once`}
          status={heldCapHit ? 'capped' : 'ok'}
          detail={`You're holding ${freezesAvailable}/${STREAK_SHIELD_RULES.MAX_HELD}`}
        />
        <Rule
          icon={<Clock className="w-4 h-4" />}
          label="Cooldown"
          value={`${STREAK_SHIELD_RULES.COOLDOWN_DAYS} day between uses`}
          status={cooldown > 0 ? 'cooldown' : 'ok'}
          detail={cooldown > 0 ? `${cooldown} day(s) remaining` : 'Ready to use'}
        />
        <Rule
          icon={<Calendar className="w-4 h-4" />}
          label="Weekly cap"
          value={`Max ${STREAK_SHIELD_RULES.MAX_PER_WEEK} per 7-day window`}
          status={weeklyCapHit ? 'capped' : 'ok'}
          detail={`Used ${usedThisWeek}/${STREAK_SHIELD_RULES.MAX_PER_WEEK} this week`}
        />
        <Rule
          icon={<Crown className="w-4 h-4" />}
          label="Premium grant"
          value={`${STREAK_SHIELD_RULES.PREMIUM_MONTHLY_GRANT} free shields per month`}
          status={isPremium ? 'ok' : 'locked'}
          detail={isPremium ? 'Active' : 'Premium only'}
        />
        <Rule
          icon={<Zap className="w-4 h-4" />}
          label="Buy with XP"
          value={`${STREAK_SHIELD_RULES.XP_COST} XP per shield`}
          status="ok"
          detail={`You have ${profile?.xp ?? 0} XP`}
        />
      </div>

      {/* When it saves you */}
      <div className="glass rounded-card p-4 mb-5 shadow-card">
        <p className="text-sm font-bold text-foreground mb-2">When it kicks in</p>
        <ul className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <li>✅ Activated <strong className="text-foreground">before midnight</strong> on a missed day → streak preserved.</li>
          <li>⏳ Cannot retroactively save a streak you already lost.</li>
          <li>🚫 Cannot stack — one shield covers one day.</li>
          <li>🔒 Doesn't pause habits — they still appear, just won't break the streak.</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          onClick={useFreeze}
          disabled={!canFreeze || cooldown > 0 || weeklyCapHit}
          className="w-full gradient-primary text-primary-foreground rounded-btn h-12"
        >
          {todayFrozen
            ? '✅ Already protected today'
            : !isPremium
              ? '🔒 Premium required'
              : freezesAvailable === 0
                ? 'No shields left'
                : cooldown > 0
                  ? `Cooldown · ${cooldown}d`
                  : weeklyCapHit
                    ? 'Weekly cap reached'
                    : '🛡️ Activate shield today'}
        </Button>
        <Button
          onClick={buyFreezeWithXP}
          disabled={!isPremium || heldCapHit || (profile?.xp ?? 0) < STREAK_SHIELD_RULES.XP_COST}
          variant="outline"
          className="w-full rounded-btn h-11"
        >
          Buy 1 shield · {STREAK_SHIELD_RULES.XP_COST} XP
        </Button>
      </div>
    </motion.div>
  );
}

function Rule({ icon, label, value, status, detail }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'ok' | 'cooldown' | 'capped' | 'locked';
  detail: string;
}) {
  const colors = {
    ok: 'text-success',
    cooldown: 'text-warning',
    capped: 'text-warning',
    locked: 'text-muted-foreground',
  };
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-b-0 last:pb-0">
      <div className={`mt-0.5 ${colors[status]}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{value}</p>
      </div>
      <div className={`text-[11px] font-semibold ${colors[status]}`}>{detail}</div>
    </div>
  );
}
