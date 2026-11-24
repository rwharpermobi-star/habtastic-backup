import { PlayCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  perView: number;
  viewsLeft: number;
  watching: boolean;
  onWatch: () => void;
  onUpgrade: () => void;
};

/** Opt-in offer shown only after a Free user runs out of Winston messages. */
export default function WinstonAdRewardCard({ perView, viewsLeft, watching, onWatch, onUpgrade }: Props) {
  return (
    <section
      aria-label="Get more Winston messages"
      className="rounded-card border border-border/50 bg-card p-4 shadow-card space-y-3 animate-fade-in-up"
    >
      <div>
        <p className="text-body font-semibold text-foreground">Out of free messages for today</p>
        <p className="text-caption text-muted-foreground">
          Optional: watch a short ad to get {perView} more Winston messages today.
          {' '}{viewsLeft} {viewsLeft === 1 ? 'ad' : 'ads'} left today.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1 rounded-btn" disabled={watching} onClick={onWatch}>
          {watching ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          {watching ? 'Checking ad…' : `Watch ad (+${perView})`}
        </Button>
        <Button type="button" className="flex-1 rounded-btn gradient-primary text-primary-foreground" disabled={watching} onClick={onUpgrade}>
          Go unlimited
        </Button>
      </div>
    </section>
  );
}
