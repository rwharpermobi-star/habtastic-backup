import { useChallenges } from '@/hooks/useChallenges';
import { usePageMeta } from '@/lib/usePageMeta';
import { CHALLENGE_TEMPLATES } from '@/lib/challengeStore';
import { todayStr } from '@/lib/habitStore';
import { Trophy, Play, CheckCircle2, Clock, Flame, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usePremium } from '@/hooks/usePremium';
import { useNavigate } from 'react-router-dom';

export default function Challenges() {
  usePageMeta({
    title: 'Habit Challenges — HabTastic AI',
    description: 'Join daily and friend habit challenges to keep your streaks alive and earn XP in HabTastic AI.',
    canonicalPath: '/challenges',
  });

  const { isPremium } = usePremium();
  const navigate = useNavigate();
  const {
    challenges,
    lockedChallenges,
    startChallenge,
    checkIn,
    isActive,
    isComplete,
  } = useChallenges();

  // Keep existing challenge records visible after Premium expires. They are
  // paused, not deleted, and become interactive again when Premium returns.
  const visibleChallenges = isPremium ? challenges : lockedChallenges;
  const today = todayStr();

  const handleStart = async (template: typeof CHALLENGE_TEMPLATES[0]) => {
    if (!isPremium) return;
    const existing = visibleChallenges.find(c => c.title === template.title && isActive(c));
    if (existing) { toast.error('You already have this challenge active!'); return; }
    await startChallenge(template);
    toast.success(`Challenge "${template.title}" started! 🚀`);
  };

  const handleCheckIn = async (id: string) => {
    if (!isPremium) return;
    const completed = await checkIn(id);
    if (completed) {
      const c = visibleChallenges.find(ch => ch.id === id);
      toast.success(`🎉 Challenge complete! +${c?.reward_xp || 0} XP earned!`);
    } else {
      toast.success('Day checked! Keep going! 💪');
    }
  };

  const activeChallenges = visibleChallenges.filter(c => isActive(c));
  const completedChallenges = visibleChallenges.filter(c => isComplete(c));

  return (
    <div className="min-h-screen pb-24 px-5 pt-14 bg-background">
      <div className="flex items-center gap-2 mb-6">
        <Trophy className="w-6 h-6 text-primary" strokeWidth={1.5} />
        <h1 className="text-h1 text-foreground">Challenges</h1>
      </div>

      {!isPremium && visibleChallenges.length > 0 && (
        <div className="mb-6 rounded-card border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Lock className="w-4 h-4 text-primary" />
            Your challenge progress is paused
          </div>
          <p className="mt-1 text-caption text-muted-foreground">
            Your saved challenges and completed days are still here. Upgrade to Premium to continue from exactly where you stopped.
          </p>
          <Button onClick={() => navigate('/pricing')} size="sm" className="mt-3 rounded-btn gradient-primary text-primary-foreground">
            Reactivate Premium
          </Button>
        </div>
      )}

      {activeChallenges.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-caption text-muted-foreground mb-3 uppercase tracking-wider">Active</h2>
          <div className="space-y-3">
            {activeChallenges.map((c, i) => {
              const progress = Math.min(100, (c.completed_days.length / c.duration) * 100);
              const checkedToday = c.completed_days.includes(today);
              return (
                <div
                  key={c.id}
                  className={`glass rounded-card p-4 shadow-card animate-fade-in-up ${isPremium ? '' : 'opacity-45 grayscale pointer-events-none select-none'}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                  aria-disabled={!isPremium}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">{c.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-body">{c.title}</h3>
                      <p className="text-caption text-muted-foreground mt-0.5">{c.description}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full gradient-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-caption font-bold text-primary">{c.completed_days.length}/{c.duration}</span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1 text-caption text-muted-foreground">
                          <Flame className="w-3 h-3 text-accent" />
                          <span>+{c.reward_xp} XP</span>
                        </div>
                        <Button onClick={() => handleCheckIn(c.id)} disabled={!isPremium || checkedToday} size="sm" className={`rounded-btn text-caption h-8 ${checkedToday ? 'bg-secondary text-muted-foreground' : 'gradient-primary text-primary-foreground'}`}>
                          {checkedToday ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Done</> : 'Check in'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {completedChallenges.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-caption text-muted-foreground mb-3 uppercase tracking-wider">Completed 🏆</h2>
          <div className="space-y-3">
            {completedChallenges.map((c, i) => (
              <div key={c.id} className={`glass rounded-card p-4 shadow-card animate-fade-in-up ${isPremium ? 'opacity-70' : 'opacity-45 grayscale pointer-events-none select-none'}`} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{c.reward_badge}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-body">{c.title}</h3>
                    <p className="text-caption text-accent">+{c.reward_xp} XP earned</p>
                    <p className="text-[11px] text-muted-foreground">{c.completed_days.length}/{c.duration} days completed</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-accent" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="font-semibold text-caption text-muted-foreground mb-3 uppercase tracking-wider">Browse Challenges</h2>
      {!isPremium && (
        <p className="text-caption text-muted-foreground mb-3">Starting new challenges requires Premium. Your existing challenge progress above remains saved.</p>
      )}
      <div className={`space-y-3 ${isPremium ? '' : 'opacity-45 grayscale'}`}>
        {CHALLENGE_TEMPLATES.map((t, i) => {
          const hasActive = visibleChallenges.some(c => c.title === t.title && isActive(c));
          return (
            <div key={t.title} className="glass rounded-card p-4 shadow-card animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-start gap-3">
                <span className="text-3xl">{t.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-body">{t.title}</h3>
                    <span className="text-caption px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                      <Clock className="w-3 h-3 inline mr-0.5" />{t.duration}d
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground mt-0.5">{t.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-caption text-accent font-medium">🎁 +{t.reward.xp} XP</span>
                    <Button onClick={() => handleStart(t)} disabled={!isPremium || hasActive} size="sm" className="rounded-btn text-caption h-8 gradient-primary text-primary-foreground gap-1 active:scale-[0.98] transition-transform">
                      {!isPremium ? <Lock className="w-3 h-3" /> : <Play className="w-3 h-3" />} {hasActive ? 'Active' : isPremium ? 'Start' : 'Premium'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
