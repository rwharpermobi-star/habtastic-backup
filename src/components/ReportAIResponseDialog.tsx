import { useState } from 'react';
import { Loader2, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const AI_REPORT_CATEGORY = 'AI Response Report';

const REASONS = [
  'Harmful or unsafe',
  'Hate/harassment',
  'Sexual/inappropriate',
  'False or misleading',
  'Spam/irrelevant',
  'Other',
] as const;

const MAX_EXCERPT = 1500;

interface ReportAIResponseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Winston assistant response being reported */
  responseText: string;
  /** Timestamp of the reported message (ISO string or epoch ms), if known */
  messageTs?: string | number;
  /** Extra context, e.g. coach id or preceding user prompt */
  context?: Record<string, string | number | null | undefined>;
}

export default function ReportAIResponseDialog({
  open,
  onOpenChange,
  responseText,
  messageTs,
  context,
}: ReportAIResponseDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to report a response');
      return;
    }
    setSubmitting(true);

    const excerpt = responseText.slice(0, MAX_EXCERPT);
    const truncated = responseText.length > MAX_EXCERPT;
    const reportId = crypto.randomUUID();
    const reportedAt = new Date().toISOString();
    const parsedTs = messageTs ? new Date(messageTs) : null;
    const messageAt = parsedTs && !Number.isNaN(parsedTs.getTime()) ? parsedTs.toISOString() : null;

    const message = [
      `Reason: ${reason}`,
      details.trim() ? `Details: ${details.trim()}` : null,
      `Message timestamp: ${messageAt ?? 'unknown'}`,
      `Reported at: ${reportedAt}`,
      `Reporting user id: ${user.id}`,
      `Reported Winston response${truncated ? ' (excerpt)' : ''}:\n${excerpt}`,
    ]
      .filter(Boolean)
      .join('\n');

    const { error } = await supabase.from('feedback').insert({
      id: reportId,
      user_id: user.id,
      category: AI_REPORT_CATEGORY,
      message,
      metadata: {
        reason,
        details: details.trim() || null,
        response_excerpt: excerpt,
        response_truncated: truncated,
        message_at: messageAt,
        reported_at: reportedAt,
        source: 'winston_chat',
        ...(context ?? {}),
      },
    });

    setSubmitting(false);

    if (error) {
      toast.error('Could not send report. Please try again.');
      return;
    }

    // Notify support (fire-and-forget, same style as SubmitFeedback)
    supabase.functions
      .invoke('send-transactional-email', {
        body: {
          templateName: 'support-notification',
          idempotencyKey: `support-${reportId}`,
          templateData: {
            category: AI_REPORT_CATEGORY,
            message,
            userName: user.user_metadata?.name || null,
            userEmail: user.email,
            userId: user.id,
            submittedAt: reportedAt,
          },
        },
      })
      .catch((err) => console.error('Support notification failed:', err));

    toast.success('Report sent — thanks for flagging it 🙏');
    setDetails('');
    setReason(REASONS[0]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md rounded-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-primary" />
            Report this response
          </DialogTitle>
          <DialogDescription>
            Tell us what's wrong with this Winston message. Our team reviews every report.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
          {REASONS.map((r) => (
            <div key={r} className="flex items-center gap-3">
              <RadioGroupItem value={r} id={`ai-report-${r}`} />
              <Label htmlFor={`ai-report-${r}`} className="text-body font-normal cursor-pointer">
                {r}
              </Label>
            </div>
          ))}
        </RadioGroup>

        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          placeholder="Add details (optional)"
          rows={3}
          className="bg-background border-border rounded-input resize-none"
        />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gradient-primary text-primary-foreground">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              'Submit report'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
