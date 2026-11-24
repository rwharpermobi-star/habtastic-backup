import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const feedbackSchema = z.object({
  category: z.string().trim().min(1, 'Category is required').max(100),
  message: z
    .string()
    .trim()
    .min(5, 'Message must be at least 5 characters')
    .max(1000, 'Message must be less than 1000 characters'),
});

export default function SubmitFeedback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const category = params.get('category') || 'General';
  const topic = params.get('topic') || '';
  const referredEmail = params.get('referredEmail') || '';
  const { user } = useAuth();
  const buildInitial = () => {
    let s = '';
    if (topic) s += `Re: ${topic}\n\n`;
    if (referredEmail) s += `Referred user email: ${referredEmail}\n\nDetails:\n`;
    return s;
  };
  const [message, setMessage] = useState(buildInitial());
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to send feedback');
      return;
    }
    const result = feedbackSchema.safeParse({ category, message });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const feedbackId = crypto.randomUUID();
    const { error } = await supabase.from('feedback').insert({
      id: feedbackId,
      user_id: user.id,
      category: result.data.category,
      message: result.data.message,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Could not send feedback. Please try again.');
      return;
    }

    // Notify the support team (fire-and-forget)
    void supabase.functions
      .invoke('send-transactional-email', {
        body: {
          templateName: 'support-notification',
          idempotencyKey: `support-${feedbackId}`,
          templateData: {
            category: result.data.category,
            message: result.data.message,
            userName: user.user_metadata?.name || null,
            userEmail: user.email,
            userId: user.id,
            submittedAt: new Date().toISOString(),
          },
        },
      })
      .then(({ error: notificationError }) => {
        if (notificationError) console.error('Support notification failed:', notificationError);
      })
      .catch((err) => console.error('Support notification failed:', err));

    toast.success('Feedback sent 💌');
    setMessage('');
    setTimeout(() => navigate(-1), 600);
  };

  return (
    <motion.div
      className="min-h-screen pb-24 px-5 pt-14 bg-background"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground mb-6 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-body font-medium">Back</span>
      </button>

      <h1 className="text-h1 text-foreground mb-2">Submit Feedback</h1>
      <p className="text-caption text-muted-foreground mb-6">
        Topic: <span className="text-primary font-medium">{category}</span>
      </p>

      <div className="glass rounded-card p-4 mb-3 border border-primary/10">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
          placeholder="Tell us what's on your mind…"
          rows={8}
          autoFocus
          className="bg-background border-border rounded-input resize-none min-h-[180px]"
        />
        <p className="text-caption text-muted-foreground text-right mt-2">{message.length}/1000</p>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || message.trim().length < 5}
        className="w-full gradient-primary text-primary-foreground rounded-btn h-12"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Send Feedback
          </>
        )}
      </Button>
    </motion.div>
  );
}
