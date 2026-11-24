import { useState } from 'react';
import { usePageMeta } from '@/lib/usePageMeta';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, Rocket, Puzzle, Compass, Heart, Flame, Snowflake, BookOpen, Mic, Volume2, Brain, Star, PiggyBank, ChevronDown, Play } from 'lucide-react';
import QuickTour from '@/components/QuickTour';
import HowItWorksVideo from '@/components/HowItWorksVideo';
import { Button } from '@/components/ui/button';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: 'easeOut' as const },
  }),
};

const features = [
  { icon: Flame, title: 'Streak', desc: 'Build daily consistency. Every day you log a habit or note, your streak grows. Miss a day and it resets — unless you have a freeze.' },
  { icon: Snowflake, title: 'Streak Shields', desc: 'Life happens. A Streak Shield protects your streak for one missed day. Earn shields through XP, levels, or challenges.' },
  { icon: BookOpen, title: 'Private Diary & Journal', desc: 'Your private passcode-protected journal. Write or speak your thoughts, capture mood check-ins, and review personal reflections.' },
  { icon: Mic, title: 'Voice Input', desc: 'Speak instead of type when chatting with Winston AI or recording reflections.' },
  { icon: Volume2, title: 'Voice Playback', desc: 'Listen to Winston AI coaching replies read aloud in a natural, encouraging voice.' },
  { icon: Brain, title: 'Winston AI Coach', desc: 'Winston works directly with your real habits, streaks, and savings goals to build bounce-back plans and weekly AI reviews.' },
  { icon: PiggyBank, title: 'Money Saver Goals', desc: 'Set named savings targets on Home, log deposits, and see daily and weekly pacing toward your goal date.' },
  { icon: Star, title: 'XP, Levels & Daily Chest', desc: 'Earn XP for completing quests, finish every due habit to unlock your Daily Reward Chest, and climb Weekly Leaderboards.' },
];

const sections = [
  {
    icon: Sparkles, title: 'What HabTastic Is',
    text: 'HabTastic AI is your personal habit, streak, savings, and AI coaching system designed to turn big goals into daily momentum.',
  },
  {
    icon: Rocket, title: 'What You Can Do',
    text: 'Complete Today’s Quests, protect streaks with Shields, chat by voice or text with Winston AI, track Money Saver goals, and earn XP.',
  },
  {
    icon: Compass, title: 'How to Use HabTastic',
    text: 'Add 1–3 daily quests in Habits, check them off on Home, ask Winston AI whenever life interrupts your plan, and track your heatmaps in Progress.',
  },
  {
    icon: Heart, title: 'Our Story',
    text: 'Built with care — a calm space for reflection, growth, and self-discovery. Because personal growth shouldn\'t feel stressful.',
  },
];

export default function About() {
  usePageMeta({
    title: 'About HabTastic AI — Our Habit Tracking Mission',
    description: 'Learn how HabTastic AI combines habit tracking, streaks and AI coaching to help you build routines that stick and reach long-term goals.',
    canonicalPath: '/about',
  });

  const navigate = useNavigate();
  const [expandedFeature, setExpandedFeature] = useState<number | null>(null);
  const [showTour, setShowTour] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-10" />
        <div className="relative px-5 pt-12 pb-8">
          <button onClick={() => navigate('/profile')} aria-label="Back to profile" className="mb-6 p-2 -ml-2 rounded-full hover:bg-secondary/60 transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" aria-hidden="true" />
          </button>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-h1 text-foreground mb-2"
          >
            About HabTastic AI
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-body text-muted-foreground"
          >
            Understand how your app works and how it helps you grow
          </motion.p>
        </div>
      </div>

      {/* Video Walkthrough + Section Cards */}
      <div className="px-5 space-y-4 mt-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <HowItWorksVideo compact showCaptions={false} />
        </motion.div>

        {sections.map((s, i) => (
          <motion.div
            key={s.title}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="bg-card rounded-card border border-border shadow-card p-4 active:scale-[0.98] transition-transform duration-150"
          >
            <div className="flex gap-3.5 items-start">
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center shrink-0">
                <s.icon className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-h3 text-foreground mb-1">{s.title}</h2>
                <p className="text-body text-muted-foreground leading-relaxed">{s.text}</p>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Features Explained — Expandable */}
        <motion.div
          custom={sections.length}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="bg-card rounded-card border border-border shadow-card p-4"
        >
          <div className="flex gap-3.5 items-start mb-3">
            <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center shrink-0">
              <Puzzle className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-h3 text-foreground">Features Explained</h2>
              <p className="text-caption text-muted-foreground">Tap any feature to learn more</p>
            </div>
          </div>

          <div className="space-y-2 ml-[3.375rem]">
            {features.map((f, i) => (
              <div key={f.title}>
                <button
                  onClick={() => setExpandedFeature(expandedFeature === i ? null : i)}
                  className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-xl hover:bg-secondary/60 transition-colors text-left active:scale-[0.98]"
                >
                  <f.icon className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-body font-medium text-foreground flex-1">{f.title}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expandedFeature === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {expandedFeature === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <p className="text-body text-muted-foreground px-3 pb-2 leading-relaxed">
                        {f.desc}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Tour Button */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="px-5 mt-8"
      >
        <Button
          onClick={() => setShowTour(true)}
          className="w-full h-13 text-btn gap-2 shadow-lg"
          size="lg"
        >
          <Play className="w-4 h-4" />
          Take a Quick Tour
        </Button>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-6 px-5 space-y-3"
      >
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-caption">
          <button onClick={() => navigate('/privacy')} className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Privacy Policy
          </button>
          <button onClick={() => navigate('/terms')} className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Terms of Service
          </button>
          <button onClick={() => navigate('/refunds')} className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Refund Policy
          </button>
        </nav>
        <p className="text-center text-caption text-muted-foreground">
          Made with ❤️ by HabTastic
        </p>
      </motion.div>

      <QuickTour open={showTour} onClose={() => setShowTour(false)} />
    </div>
  );
}
