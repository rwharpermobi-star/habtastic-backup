import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Zap } from 'lucide-react';
import { useHabitVerification } from '@/hooks/useHabitVerification';
import { questionForHabit } from '@/lib/winstonQuestions';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitId: string;
  habitName: string;
  habitEmoji: string;
  habitCategory: string;
  customQuestion?: string | null;
  completedDate: string;
  onVerified?: () => void;
}

export default function HabitVerificationDialog({
  open, onOpenChange,
  habitId, habitName, habitEmoji, habitCategory, customQuestion, completedDate, onVerified,
}: Props) {
  const { submit } = useHabitVerification();
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const question = questionForHabit(habitCategory, customQuestion);

  useEffect(() => { if (open) setResponse(''); }, [open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = await submit(habitId, completedDate, question, response);
    setSubmitting(false);
    if (result) {
      onVerified?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border rounded-card max-w-sm mx-auto shadow-card">
        <DialogHeader>
          <DialogTitle className="text-h3 font-display flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Winston wants to know
          </DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            {habitEmoji} {habitName} — verify for +25 XP and +5 🪙
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <p className="text-body font-medium text-foreground">{question}</p>
          <Textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            placeholder="Type your answer…"
            maxLength={2000}
            rows={4}
            className="bg-secondary border-border rounded-input"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={submitting}
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || response.trim().length < 3}
              className="flex-1 gradient-primary text-white font-semibold glow-primary"
            >
              <Zap className="w-4 h-4 mr-1.5" />
              {submitting ? 'Saving…' : 'Verify'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
