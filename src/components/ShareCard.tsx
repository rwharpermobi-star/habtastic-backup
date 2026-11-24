import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ShareCardProps {
  title: string;
  subtitle: string;
  emoji: string;
  stat: string;
  children?: React.ReactNode;
}

export default function ShareCard({ title, subtitle, emoji, stat, children }: ShareCardProps) {
  const [copied, setCopied] = useState(false);

  const shareText = `${emoji} ${title}\n${subtitle}\n${stat}\n\nTracked with HabTastic ⚡🚀`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText });
      } catch { /* ignore: best effort */ }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-1.5 rounded-btn">
            <Share2 className="w-3.5 h-3.5" /> Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm mx-auto rounded-card">
        <DialogHeader>
          <DialogTitle className="text-lg">Share Achievement</DialogTitle>
        </DialogHeader>

        {/* Card Preview */}
        <div className="gradient-accent rounded-card p-6 text-center text-white">
          <span className="text-4xl block mb-3">{emoji}</span>
          <h3 className="font-bold text-lg">{title}</h3>
          <p className="text-white/80 text-sm mt-1">{subtitle}</p>
          <p className="font-bold text-2xl mt-3">{stat}</p>
          <p className="text-white/60 text-xs mt-3 font-display">HabTastic ⚡🚀</p>
        </div>

        <div className="flex gap-2 mt-2">
          <Button onClick={handleShare} className="flex-1 gradient-primary text-primary-foreground rounded-btn gap-2">
            <Share2 className="w-4 h-4" /> Share
          </Button>
          <Button onClick={handleCopy} variant="outline" className="rounded-btn gap-2">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
