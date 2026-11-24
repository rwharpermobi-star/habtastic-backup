import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const HABIT_MODES = [
  { id: 'daily', label: 'Daily', desc: 'Track habits every day' },
  { id: 'weekly', label: 'Weekly', desc: 'Set weekly habit goals' },
];

const DIFFICULTY_LEVELS = [
  { id: 'easy', label: 'Easy', desc: 'Gentle start', emoji: '🌱' },
  { id: 'medium', label: 'Medium', desc: 'Balanced challenge', emoji: '⚡' },
  { id: 'hard', label: 'Hard', desc: 'Push your limits', emoji: '🔥' },
];

const FOCUS_AREAS = [
  { id: 'fitness', label: 'Fitness', emoji: '💪' },
  { id: 'discipline', label: 'Discipline', emoji: '🎯' },
  { id: 'mindset', label: 'Mindset', emoji: '🧠' },
  { id: 'money', label: 'Money', emoji: '💰' },
];

export default function HabitsAISettings() {
  const navigate = useNavigate();
  const [habitMode, setHabitMode] = useState(() => localStorage.getItem('habtastic-habit-mode') || 'daily');
  const [difficulty, setDifficulty] = useState(() => localStorage.getItem('habtastic-difficulty') || 'medium');
  const [aiCoach, setAiCoach] = useState(() => localStorage.getItem('habtastic-ai-coach') !== 'off');
  const [focusAreas, setFocusAreas] = useState<string[]>(() => {
    const saved = localStorage.getItem('habtastic-focus-areas');
    return saved ? JSON.parse(saved) : ['fitness', 'discipline'];
  });

  const save = (key: string, value: string) => localStorage.setItem(key, value);

  const toggleFocus = (id: string) => {
    const updated = focusAreas.includes(id) ? focusAreas.filter(f => f !== id) : [...focusAreas, id];
    setFocusAreas(updated);
    localStorage.setItem('habtastic-focus-areas', JSON.stringify(updated));
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>
      <h1 className="text-h1 text-foreground mb-6">Habits & AI</h1>

      {/* Habit Mode */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Habit Mode</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {HABIT_MODES.map((mode, i) => (
          <button
            key={mode.id}
            onClick={() => { setHabitMode(mode.id); save('habtastic-habit-mode', mode.id); toast.success(`Switched to ${mode.label} mode`); }}
            className={`w-full flex items-center gap-3 p-4 text-left transition-all ${i < HABIT_MODES.length - 1 ? 'border-b border-border/40' : ''} ${habitMode === mode.id ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
          >
            <div className="flex-1">
              <p className="text-body font-medium text-foreground">{mode.label}</p>
              <p className="text-caption text-muted-foreground">{mode.desc}</p>
            </div>
            {habitMode === mode.id && (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Difficulty */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Difficulty Level</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {DIFFICULTY_LEVELS.map((lvl, i) => (
          <button
            key={lvl.id}
            onClick={() => { setDifficulty(lvl.id); save('habtastic-difficulty', lvl.id); toast.success(`Difficulty: ${lvl.label}`); }}
            className={`w-full flex items-center gap-3 p-4 text-left transition-all ${i < DIFFICULTY_LEVELS.length - 1 ? 'border-b border-border/40' : ''} ${difficulty === lvl.id ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
          >
            <span className="text-xl">{lvl.emoji}</span>
            <div className="flex-1">
              <p className="text-body font-medium text-foreground">{lvl.label}</p>
              <p className="text-caption text-muted-foreground">{lvl.desc}</p>
            </div>
            {difficulty === lvl.id && (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* AI Coach Toggle */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">AI Coach</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        <div className="flex items-center gap-3 p-4">
          <span className="text-xl">🤖</span>
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">AI Coach</p>
            <p className="text-caption text-muted-foreground">Personalized guidance & tips</p>
          </div>
          <Switch checked={aiCoach} onCheckedChange={(v) => { setAiCoach(v); localStorage.setItem('habtastic-ai-coach', v ? 'on' : 'off'); }} />
        </div>
      </div>

      {/* Focus Areas */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Focus Areas</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {FOCUS_AREAS.map((area, i) => (
          <button
            key={area.id}
            onClick={() => toggleFocus(area.id)}
            className={`w-full flex items-center gap-3 p-4 text-left transition-all ${i < FOCUS_AREAS.length - 1 ? 'border-b border-border/40' : ''} ${focusAreas.includes(area.id) ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
          >
            <span className="text-xl">{area.emoji}</span>
            <p className="text-body font-medium text-foreground flex-1">{area.label}</p>
            {focusAreas.includes(area.id) && (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
