import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, CheckCircle2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useDailyReflection } from '@/hooks/useDailyReflection';
import { pickDailyReflectionPrompt } from '@/lib/winstonQuestions';

export default function DailyReflectionCard() {
  const { today, loading, submit } = useDailyReflection();
  const prompt = useMemo(() => pickDailyReflectionPrompt(), []);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;

  if (today) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl px-4 py-4 bg-gradient-to-br from-success/12 via-success/6 to-transparent border border-success/20"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <p className="text-caption font-semibold text-success">Reflection complete</p>
        </div>
        <p className="text-caption text-muted-foreground italic">{today.prompt}</p>
        <p className="text-body text-foreground mt-1.5 leading-relaxed">{today.response}</p>
      </motion.div>
    );
  }

  const handle = async () => {
    setSubmitting(true);
    const ok = await submit(prompt, response);
    setSubmitting(false);
    if (ok) setResponse('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl px-4 py-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20"
    >
      <div className="flex items-center gap-2 mb-2">
        <Heart className="w-4 h-4 text-primary" />
        <p className="text-caption font-semibold text-primary">Daily Reflection · +10 XP +5 🪙</p>
      </div>
      <p className="text-body font-medium text-foreground leading-snug mb-3">{prompt}</p>
      <Textarea
        value={response}
        onChange={e => setResponse(e.target.value)}
        placeholder="A few honest words for Winston…"
        rows={3}
        maxLength={2000}
        className="bg-secondary border-border rounded-input mb-3"
      />
      <Button
        onClick={handle}
        disabled={submitting || response.trim().length < 5}
        className="w-full gradient-primary text-white font-semibold rounded-btn"
      >
        {submitting ? 'Saving…' : 'Reflect & Earn'}
      </Button>
    </motion.div>
  );
}
