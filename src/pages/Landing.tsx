import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Brain,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Crown,
  Flame,
  Gift,
  HeartPulse,
  LineChart,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  PiggyBank,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PublicFooter from '@/components/PublicFooter';
import HowItWorksVideo, { HowItWorksModal } from '@/components/HowItWorksVideo';
import { usePageMeta } from '@/lib/usePageMeta';
import heroOwlAsset from '@/assets/hero-owl.jpg.asset.json';
import winstonHappy from '@/assets/winston-happy.jpg';

const heroStats = [
  { value: '4', label: 'active habits on Free' },
  { value: '5/day', label: 'Winston messages on Free' },
  { value: '5 days', label: 'full Premium trial' },
];

const features = [
  {
    icon: Brain,
    title: 'Habit tracking that grows with you',
    text: 'Build daily, weekly or custom-schedule habits. Free accounts can keep up to 4 active habits, while Premium and the active trial are unlimited.',
  },
  {
    icon: MessageCircle,
    title: 'Winston AI coach',
    text: 'Get personalised coaching, practical plans, encouragement and honest feedback based on the habits you are actually building.',
  },
  {
    icon: Flame,
    title: 'Streaks that keep you moving',
    text: 'See momentum grow day by day, protect important streaks with streak shields and celebrate the milestones that matter.',
  },
  {
    icon: Trophy,
    title: 'XP, levels & achievements',
    text: 'Turn consistency into visible progress with XP, levels, badges, achievements, challenges and daily rewards.',
  },
  {
    icon: BarChart3,
    title: 'Progress you can understand',
    text: 'Use heatmaps, consistency trends, weekly reviews and monthly reporting to see what is working — not just what you planned.',
  },
  {
    icon: BellRing,
    title: 'Smart reminders',
    text: 'Stay on track with habit reminders, streak-risk alerts, quiet hours and comeback nudges when life interrupts your routine.',
  },
  {
    icon: PiggyBank,
    title: 'Money Saver',
    text: 'Set savings goals, record deposits, see daily and weekly targets, track whether you are on pace and ask Winston for help adjusting the plan.',
  },
  {
    icon: Users,
    title: 'Community & challenges',
    text: 'Join challenges, compare progress on leaderboards and add accountability without turning the app into another noisy social feed.',
  },
  {
    icon: HeartPulse,
    title: 'Journal & wellbeing tools',
    text: 'Capture reflections, moods and personal progress so your habit data has context instead of becoming another row of checkboxes.',
  },
];

const steps = [
  {
    icon: UserPlus,
    title: 'Create your account',
    text: 'Sign up with email or Google. Every new account starts with a 5-day full Premium trial.',
  },
  {
    icon: ListChecks,
    title: 'Build your routine',
    text: 'Add the habits and goals you care about, choose schedules and reminders, and start with a plan you can actually sustain.',
  },
  {
    icon: LineChart,
    title: 'Improve with real feedback',
    text: 'Complete habits, build streaks, review your progress and let Winston help you adjust when your plan stops fitting real life.',
  },
];

const freeFeatures = [
  'Up to 4 active habits',
  '5 Winston AI messages per UTC day',
  '1 active Money Saver goal',
  'Basic analytics',
  'Community & leaderboards',
  'Daily rewards',
  'Standard reminders',
];

const premiumFeatures = [
  'Unlimited habits & Money Saver goals',
  'Unlimited Winston AI coaching',
  'Personalised AI coaching',
  'Weekly AI reviews & insights',
  'Advanced analytics & reports',
  'Smart reminders',
  'Premium challenges & themes',
  'Ad-free Android experience',
];

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-3xl mx-auto text-center mb-9 sm:mb-12">
      <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight">{title}</h2>
      {body ? <p className="mt-4 text-muted-foreground text-base sm:text-lg leading-relaxed">{body}</p> : null}
    </div>
  );
}

function AppPreview() {
  const habits = [
    { label: 'Morning walk', done: true },
    { label: 'Read 20 minutes', done: true },
    { label: 'Drink more water', done: false },
  ];

  return (
    <div className="relative mx-auto w-full max-w-[390px]">
      <div aria-hidden className="absolute -inset-10 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative rounded-[2.35rem] border border-border/70 bg-card p-3 shadow-2xl shadow-primary/10">
        <div className="rounded-[1.8rem] border border-border/60 bg-background overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Good morning</p>
              <p className="font-display font-bold text-lg">Your day is ready ✨</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-primary" />
            </div>
          </div>

          <div className="px-4 pb-4 space-y-3">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 to-transparent p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Today&apos;s progress</p>
                  <p className="mt-1 text-2xl font-display font-bold">67%</p>
                </div>
                <span className="text-xs font-semibold text-primary">2 of 3 done</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full w-2/3 rounded-full bg-primary" />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold">Today&apos;s habits</p>
                <span className="text-[11px] text-muted-foreground">Keep going</span>
              </div>
              <div className="space-y-2">
                {habits.map((habit) => (
                  <div key={habit.label} className="flex items-center gap-3 rounded-xl bg-secondary/45 px-3 py-2.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center ${habit.done ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`}>
                      {habit.done ? <Check className="w-3 h-3" /> : null}
                    </span>
                    <span className={`text-xs font-medium ${habit.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{habit.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-secondary/30 bg-secondary/15 p-3.5">
              <div className="flex items-start gap-3">
                <img src={winstonHappy} alt="" aria-hidden="true" className="w-11 h-11 rounded-2xl object-cover" />
                <div className="min-w-0">
                  <p className="text-xs font-bold">Winston</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">You&apos;re already 2/3 through today. Finish the water habit before lunch and protect the streak.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">Current streak</p>
                <p className="mt-1 font-display font-bold"><Flame className="inline w-4 h-4 text-warning mr-1" />12 days</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <p className="text-[10px] text-muted-foreground">Savings goal</p>
                <p className="mt-1 font-display font-bold">42%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -left-5 sm:-left-14 top-20 hidden xs:block rounded-2xl border border-border bg-card/95 backdrop-blur px-3.5 py-3 shadow-lg">
        <p className="text-[10px] text-muted-foreground">Level progress</p>
        <p className="font-display font-bold text-sm">+120 XP today</p>
      </div>
      <div className="absolute -right-4 sm:-right-12 bottom-24 rounded-2xl border border-border bg-card/95 backdrop-blur px-3.5 py-3 shadow-lg">
        <p className="text-[10px] text-muted-foreground">Streak alive</p>
        <p className="font-display font-bold text-sm">🔥 12 days</p>
      </div>
    </div>
  );
}

export default function Landing() {
  const [showWalkthroughModal, setShowWalkthroughModal] = useState(false);

  usePageMeta({
    title: 'HabTastic AI — Build Better Habits with Winston AI',
    description:
      'Build habits, maintain streaks, track progress, save toward goals and get personalised coaching from Winston AI. Free includes up to 4 active habits and 5 Winston messages per day, with a 5-day Premium trial.',
    canonicalPath: '/',
  });

  return (
    <div data-testid="landing-page" className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="HabTastic AI home">
            <img src="/app-icon-512.png?v=4" alt="" aria-hidden="true" className="w-10 h-10 rounded-2xl shadow-sm" width={40} height={40} />
            <span className="font-display font-bold text-lg whitespace-nowrap">HabTastic AI</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-muted-foreground" aria-label="Primary navigation">
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#winston" className="hover:text-foreground">Winston AI</a>
            <a href="#money-saver" className="hover:text-foreground">Money Saver</a>
            <a href="#plans" className="hover:text-foreground">Plans</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl shadow-sm">
              <Link to="/signup">Start free <ArrowRight className="ml-1 w-3.5 h-3.5" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24 overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-[540px] bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.18),transparent_68%)]" />
          <div aria-hidden className="absolute left-[-8rem] top-40 w-80 h-80 rounded-full bg-secondary/25 blur-3xl" />
          <div aria-hidden className="absolute right-[-8rem] bottom-0 w-80 h-80 rounded-full bg-accent/10 blur-3xl" />

          <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[1.08fr_0.92fr] gap-12 lg:gap-16 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3.5 py-2 text-xs sm:text-sm font-semibold text-primary">
                <Sparkles className="w-4 h-4" /> Habits + AI coach + Money Saver
              </div>

              <h1 className="mt-6 text-4xl sm:text-6xl lg:text-7xl font-display font-bold tracking-tight leading-[1.02]">
                Build the life you keep promising yourself.
              </h1>
              <p className="mt-6 max-w-2xl mx-auto lg:mx-0 text-base sm:text-xl text-muted-foreground leading-relaxed">
                HabTastic AI turns your goals into a daily system: track habits, build streaks, earn XP, understand your progress, save toward real goals and get personalised guidance from Winston AI.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 justify-center lg:justify-start">
                <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base shadow-lg shadow-primary/15">
                  <Link to="/signup">Start my 5-day Premium trial <ArrowRight className="ml-2 w-4 h-4" /></Link>
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => setShowWalkthroughModal(true)}
                  className="h-12 rounded-xl px-5 text-base bg-background/60 border-primary/35 hover:border-primary/60 gap-2"
                >
                  <Play className="w-4 h-4 text-primary fill-primary" aria-hidden="true" />
                  Watch how it works
                </Button>
              </div>

              <p className="mt-4 text-xs sm:text-sm text-muted-foreground">
                The trial starts with your new account. When it ends, you can stay on Free or upgrade.
              </p>

              <div className="mt-9 grid grid-cols-3 gap-2 sm:gap-3 max-w-xl mx-auto lg:mx-0">
                {heroStats.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border/70 bg-card/80 backdrop-blur p-3 sm:p-4 text-center lg:text-left">
                    <p className="font-display font-bold text-lg sm:text-xl text-foreground">{item.value}</p>
                    <p className="mt-0.5 text-[10px] sm:text-xs leading-tight text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <AppPreview />
          </div>
        </section>

        <section aria-labelledby="landing-highlights" className="px-4 sm:px-6 pb-16 sm:pb-24">
          <h2 id="landing-highlights" className="sr-only">Why HabTastic AI works</h2>
          <div className="max-w-6xl mx-auto rounded-3xl border border-border/70 bg-card/70 p-5 sm:p-7 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              [Target, 'One clear daily plan', 'Know exactly what needs your attention today.'],
              [Flame, 'Momentum you can see', 'Streaks and XP make consistency tangible.'],
              [Brain, 'Coaching with context', 'Winston can help you adjust instead of just reminding you.'],
              [PiggyBank, 'Goals beyond habits', 'Track savings goals alongside your routine.'],
            ].map(([Icon, title, text]) => {
              const FeatureIcon = Icon as typeof Target;
              return (
                <div key={String(title)} className="flex gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FeatureIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{String(title)}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{String(text)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="features" className="px-4 sm:px-6 py-16 sm:py-24 border-y border-border/50 bg-card/25">
          <div className="max-w-7xl mx-auto">
            <SectionHeading
              eyebrow="Everything works together"
              title="More than a habit checklist"
              body="HabTastic is built as one personal progress system. Your habits, streaks, AI coaching, analytics, savings goals and reminders all reinforce the same thing: consistent action."
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="group rounded-3xl border border-border/70 bg-card p-5 sm:p-6 hover:-translate-y-1 hover:border-primary/35 hover:shadow-xl hover:shadow-primary/5">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="mt-4 text-lg font-display font-bold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="winston" className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div className="relative max-w-lg mx-auto lg:mx-0 order-2 lg:order-1">
              <div aria-hidden className="absolute -inset-8 bg-primary/12 rounded-full blur-3xl" />
              <div className="relative rounded-[2rem] border border-border bg-card p-4 sm:p-5 shadow-xl">
                <img src={winstonHappy} alt="Winston, HabTastic AI coach" className="w-full aspect-[4/3] object-cover rounded-[1.5rem]" />
                <div className="mt-4 rounded-2xl bg-secondary/55 p-4">
                  <p className="text-xs font-bold text-primary">WINSTON AI</p>
                  <p className="mt-2 text-sm leading-relaxed">“Your habit plan should fit your week, not fight it. Tell me what got in the way and we&apos;ll adjust the next step.”</p>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">Meet Winston</p>
              <h2 className="mt-3 text-3xl sm:text-5xl font-display font-bold tracking-tight">An AI coach that lives inside your routine.</h2>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
                Winston isn&apos;t a separate chatbot bolted onto HabTastic. He works alongside your habit system and can help you think through routines, consistency, motivation and savings goals.
              </p>

              <div className="mt-7 space-y-4">
                {[
                  ['Ask practical questions', '“How do I stop missing my evening habit?” or “What should I focus on this week?”'],
                  ['Use real progress as context', 'Build coaching around the habits and goals connected to your account instead of generic advice.'],
                  ['Free every day', 'Free users get 5 Winston messages per UTC day. Trial and Premium users get unlimited coaching.'],
                ].map(([title, text]) => (
                  <div key={title} className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button asChild variant="outline" className="mt-8 rounded-xl">
                <Link to="/signup">Try Winston free <ChevronRight className="ml-1 w-4 h-4" /></Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="money-saver" className="px-4 sm:px-6 py-16 sm:py-24 border-y border-border/50 bg-card/25">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-center">
            <div>
              <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">HabTastic Money Saver</p>
              <h2 className="mt-3 text-3xl sm:text-5xl font-display font-bold tracking-tight">Make saving money feel like a habit, not a vague intention.</h2>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
                Create a named goal, choose your target amount and date, log what you save and see exactly what pace keeps you on track. Free includes one active Money Saver goal; Premium and the active trial are unlimited.
              </p>

              <div className="mt-7 grid sm:grid-cols-2 gap-3">
                {[
                  [WalletCards, 'Daily, weekly & monthly targets'],
                  [CalendarDays, 'Target-date projections'],
                  [TrendingUp, 'On-track / behind status'],
                  [Brain, 'Winston savings guidance'],
                ].map(([Icon, label]) => {
                  const ItemIcon = Icon as typeof WalletCards;
                  return (
                    <div key={String(label)} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
                      <ItemIcon className="w-5 h-5 text-primary" />
                      <span className="text-sm font-semibold">{String(label)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-border bg-card p-5 sm:p-7 shadow-xl shadow-primary/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Holiday fund</p>
                  <h3 className="mt-1 text-2xl sm:text-3xl font-display font-bold">R4,200 of R10,000</h3>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center"><PiggyBank className="w-6 h-6 text-primary" /></div>
              </div>
              <div className="mt-5 h-3 rounded-full bg-secondary overflow-hidden"><div className="h-full w-[42%] rounded-full bg-primary" /></div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-secondary/45 p-3"><p className="text-[10px] text-muted-foreground">Progress</p><p className="mt-1 font-bold">42%</p></div>
                <div className="rounded-2xl bg-secondary/45 p-3"><p className="text-[10px] text-muted-foreground">This week</p><p className="mt-1 font-bold">R480</p></div>
                <div className="rounded-2xl bg-secondary/45 p-3"><p className="text-[10px] text-muted-foreground">Status</p><p className="mt-1 font-bold text-primary">On track</p></div>
              </div>
              <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/7 p-4 flex gap-3">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold">Your next target</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Save R240 before Friday to stay on pace for your target date.</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">Illustrative goal preview — your real values are calculated from your own goal.</p>
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-7xl mx-auto">
            <SectionHeading
              eyebrow="Motivation that compounds"
              title="Your progress should feel alive"
              body="HabTastic makes consistency visible. Instead of a boring checkbox list, every completed action contributes to a bigger picture."
            />

            <div className="grid md:grid-cols-3 gap-4 sm:gap-5">
              {[
                { icon: Flame, title: 'Build streaks', text: 'See how long you have kept promises to yourself and protect the streaks that matter most.', accent: '🔥' },
                { icon: Zap, title: 'Earn XP & level up', text: 'Completed habits feed your XP, levels and achievements so progress has momentum.', accent: '+120 XP' },
                { icon: Gift, title: 'Challenges & rewards', text: 'Use daily and community challenges to keep routines fresh without changing your core goals.', accent: '🏆' },
              ].map(({ icon: Icon, title, text, accent }) => (
                <article key={title} className="rounded-3xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Icon className="w-6 h-6 text-primary" /></div>
                    <span className="text-sm font-display font-bold text-primary">{accent}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-display font-bold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="px-4 sm:px-6 py-16 sm:py-24 border-y border-border/50 bg-card/25">
          <div className="max-w-7xl mx-auto">
            <SectionHeading
              eyebrow="Free, trial or Premium"
              title="Start with the full experience. Keep what fits."
              body="New accounts get 5 days of full Premium. After that, HabTastic remains useful on Free with up to 4 active habits, 5 Winston messages per UTC day and one active Money Saver goal, or you can keep the unlimited experience with Premium."
            />

            <div className="grid lg:grid-cols-3 gap-5 items-stretch">
              <article className="rounded-3xl border border-border bg-card p-6 sm:p-7 flex flex-col">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Free</p>
                <h3 className="mt-2 text-3xl font-display font-bold">R0</h3>
                <p className="mt-2 text-sm text-muted-foreground">Use HabTastic for as long as you want without paying.</p>
                <div className="mt-6 space-y-3 flex-1">
                  {freeFeatures.map((feature) => (
                    <div key={feature} className="flex gap-2.5 text-sm"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span>{feature}</span></div>
                  ))}
                </div>
                <Button asChild variant="outline" className="mt-7 rounded-xl"><Link to="/signup">Create free account</Link></Button>
              </article>

              <article className="relative rounded-3xl border-2 border-primary bg-card p-6 sm:p-7 flex flex-col shadow-xl shadow-primary/10 lg:-translate-y-2">
                <div className="absolute right-5 top-5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-wider">Starts automatically</div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">5-day trial</p>
                <h3 className="mt-2 text-3xl font-display font-bold">Full Premium</h3>
                <p className="mt-2 text-sm text-muted-foreground">Experience the complete product before choosing what comes next.</p>
                <div className="mt-6 space-y-3 flex-1">
                  {['Everything in Premium', 'Unlimited habits & Money Saver goals', 'Unlimited Winston AI', 'Advanced analytics', 'Smart reminders', 'Premium challenges & themes', 'No Android ads during the trial'].map((feature) => (
                    <div key={feature} className="flex gap-2.5 text-sm"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span>{feature}</span></div>
                  ))}
                </div>
                <Button asChild className="mt-7 rounded-xl"><Link to="/signup">Start my 5-day trial <ArrowRight className="ml-1 w-4 h-4" /></Link></Button>
              </article>

              <article className="rounded-3xl border border-border bg-card p-6 sm:p-7 flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">Premium</p>
                  <Crown className="w-5 h-5 text-warning" />
                </div>
                <h3 className="mt-2 text-3xl font-display font-bold">Monthly or yearly</h3>
                <p className="mt-2 text-sm text-muted-foreground">Localised pricing is shown on the Pricing screen and Google Play where applicable.</p>
                <div className="mt-6 space-y-3 flex-1">
                  {premiumFeatures.map((feature) => (
                    <div key={feature} className="flex gap-2.5 text-sm"><Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /><span>{feature}</span></div>
                  ))}
                </div>
                <Button asChild variant="outline" className="mt-7 rounded-xl"><Link to="/pricing">See Premium pricing</Link></Button>
              </article>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              eyebrow="Interactive video walkthrough"
              title="See how HabTastic AI works in 69 seconds"
              body="Watch Winston walk through your 5 bottom tabs, Today's Quests, Streak Shields, AI voice coaching, Money Saver goals, and your 5-day full Premium trial — or tap any chapter below to jump straight to a feature."
            />

            <div className="max-w-4xl mx-auto mb-12">
              <HowItWorksVideo />
            </div>

            <ol className="grid md:grid-cols-3 gap-5">
              {steps.map(({ icon: Icon, title, text }, index) => (
                <li key={title} className="relative rounded-3xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Icon className="w-6 h-6 text-primary" /></div>
                    <span className="text-5xl font-display font-bold text-primary/10">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-display font-bold">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="max-w-6xl mx-auto rounded-[2rem] overflow-hidden border border-border bg-gradient-to-br from-primary/12 via-card to-secondary/20 p-6 sm:p-10 lg:p-12">
            <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-center">
              <div>
                <div className="flex items-center gap-2 text-primary font-bold text-sm"><ShieldCheck className="w-5 h-5" /> Built with account privacy in mind</div>
                <h2 className="mt-3 text-3xl sm:text-4xl font-display font-bold">Your routines are personal. Your account should be too.</h2>
                <p className="mt-4 max-w-3xl text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Google Sign-In is used for authentication and basic account identity. HabTastic does not request access to your Gmail, contacts, calendar or files. Account data is stored through Supabase with row-level access controls, and account deletion is available from the app.
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><LockKeyhole className="w-4 h-4 text-primary" /> Secure sign-in</span>
                  <span className="inline-flex items-center gap-1.5"><Cloud className="w-4 h-4 text-primary" /> Cloud-backed progress</span>
                  <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-primary" /> User-scoped data</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                <Button asChild variant="outline" className="rounded-xl bg-background/60"><Link to="/privacy">Privacy policy</Link></Button>
                <Button asChild variant="outline" className="rounded-xl bg-background/60"><Link to="/terms">Terms</Link></Button>
              </div>
            </div>
          </div>
        </section>

        <section id="download" className="relative px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.16),transparent_70%)]" />
          <div className="relative max-w-4xl mx-auto text-center">
            <img src={heroOwlAsset.url} alt="Winston, HabTastic AI owl coach" className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover mx-auto shadow-xl" />
            <p className="mt-6 text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-primary">Your next streak starts with one action</p>
            <h2 className="mt-3 text-4xl sm:text-6xl font-display font-bold tracking-tight">Make today count.</h2>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Start with the full Premium experience for 5 days. Build unlimited habits, talk to Winston and see what your routine looks like when everything works together.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild size="lg" className="h-12 rounded-xl px-7"><Link to="/signup">Start free <ArrowRight className="ml-2 w-4 h-4" /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-7 bg-background/60"><Link to="/login">I already have an account</Link></Button>
            </div>
            <div className="mt-7 inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <Smartphone className="w-4 h-4" /> Android app rolling out on Google Play · Web/PWA available from habtastic.com
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
      <HowItWorksModal open={showWalkthroughModal} onClose={() => setShowWalkthroughModal(false)} />
    </div>
  );
}
