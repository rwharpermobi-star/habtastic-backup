import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Flame, BookOpen, Brain, Trophy, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const steps = [
  {
    icon: Target,
    title: 'Track Your Habits',
    desc: 'Create daily habits, check them off, and build consistency. Your streaks grow every day you show up.',
    route: '/habits',
    color: 'bg-primary/15 text-primary',
  },
  {
    icon: BookOpen,
    title: 'Reflect in Your Diary',
    desc: 'Tap the notebook icon on Home to write or speak private reflections with optional passcode lock.',
    route: '/diary',
    color: 'bg-accent/15 text-accent',
  },
  {
    icon: Brain,
    title: 'Coach with Winston AI',
    desc: 'Meet Winston AI — your personal habit and savings coach. Speak or type to adjust routines and get bounce-back plans.',
    route: '/coach',
    color: 'bg-success/15 text-success',
  },
  {
    icon: Trophy,
    title: 'Earn XP & Level Up',
    desc: 'Every action earns XP. Level up, unlock achievements, and watch your progress on the dashboard.',
    route: '/progress',
    color: 'bg-warning/15 text-warning',
  },
  {
    icon: Flame,
    title: 'Stay Consistent',
    desc: 'Your streak is your superpower. Come back daily, use streak freezes wisely, and never break the chain.',
    route: '/',
    color: 'bg-destructive/15 text-destructive',
  },
];

interface QuickTourProps {
  open: boolean;
  onClose: () => void;
}

export default function QuickTour({ open, onClose }: QuickTourProps) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleFinish = () => {
    onClose();
    setStep(0);
    navigate(current.route);
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-md flex items-center justify-center p-5"
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="w-full max-w-sm bg-card rounded-card border border-border shadow-card p-6 relative"
        >
          <button onClick={() => { onClose(); setStep(0); }} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-secondary/60 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Step indicator */}
          <div className="flex gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full flex-1 transition-colors duration-200 ${i <= step ? 'gradient-primary' : 'bg-secondary'}`}
              />
            ))}
          </div>

          {/* Content */}
          <div className="text-center">
            <div className={`w-16 h-16 rounded-2xl ${current.color} flex items-center justify-center mx-auto mb-5`}>
              <current.icon className="w-8 h-8" />
            </div>
            <h2 className="text-h2 text-foreground mb-2">{current.title}</h2>
            <p className="text-body text-muted-foreground leading-relaxed mb-8">{current.desc}</p>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <Button variant="outline" onClick={handleBack} className="flex-1 gap-1">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => { onClose(); setStep(0); }} className="flex-1 text-muted-foreground">
                Skip
              </Button>
            )}
            <Button onClick={handleNext} className="flex-1 gap-1">
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>

          {/* Step count */}
          <p className="text-center text-caption text-muted-foreground mt-4">
            {step + 1} of {steps.length}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
