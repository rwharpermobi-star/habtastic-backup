import { PRODUCTION_WEB_ORIGIN } from '@/lib/appOrigin';
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, MessageCircle, Facebook } from 'lucide-react';
import { toast } from 'sonner';

export type ShareType = 'streak' | 'achievement' | 'weekly' | 'daily' | 'report';

interface ShareData {
  type: ShareType;
  title: string;
  subtitle: string;
  emoji: string;
  stat: string;
  extra?: string;
}

interface SocialShareSheetProps {
  data: ShareData;
  children: React.ReactNode;
}

export default function SocialShareSheet({ data, children }: SocialShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const shareText = `${data.emoji} ${data.title}\n${data.subtitle}\n${data.stat}${data.extra ? `\n${data.extra}` : ''}\n\nTracked with HabTastic ⚡ ${PRODUCTION_WEB_ORIGIN}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: data.title, text: shareText });
        setOpen(false);
      } catch { /* ignore: best effort */ }
    } else {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    // api.whatsapp.com is more reliable than wa.me on Android browsers
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) window.location.href = url;
    setOpen(false);
  };

  const handleFacebook = () => {
    // Facebook's share dialog shares a URL; quote is best-effort and may be ignored by Facebook.
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(PRODUCTION_WEB_ORIGIN)}&quote=${encodeURIComponent(shareText)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) window.location.href = url;
    setOpen(false);
  };

  const handleSMS = () => {
    // SMS deep links must use same-tab navigation to trigger the native composer
    window.location.href = `sms:?body=${encodeURIComponent(shareText)}`;
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-[1.5rem] pb-8">
        <SheetHeader>
          <SheetTitle className="text-center">Share your progress</SheetTitle>
        </SheetHeader>

        {/* Preview Card */}
        <div className="gradient-accent rounded-card p-5 text-center text-white my-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <span className="text-4xl block mb-2">{data.emoji}</span>
          <h3 className="font-bold text-lg font-display">{data.title}</h3>
          <p className="text-white/80 text-sm mt-1">{data.subtitle}</p>
          <p className="font-bold text-2xl mt-2">{data.stat}</p>
          <p className="text-white/50 text-xs mt-3">HabTastic ⚡</p>
        </div>

        {/* Share buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <button onClick={handleWhatsApp} className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-[hsl(142,70%,45%)]/15 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-[hsl(142,70%,45%)]" />
            </div>
            <span className="text-caption font-medium text-foreground">WhatsApp</span>
          </button>
          <button onClick={handleFacebook} className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 flex items-center justify-center">
              <Facebook className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-caption font-medium text-foreground">Facebook</span>
          </button>
          <button onClick={handleSMS} className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-caption font-medium text-foreground">SMS</span>
          </button>
          <button onClick={handleCopy} className="glass rounded-card p-3 flex flex-col items-center gap-2 shadow-card active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              {copied ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5 text-accent" />}
            </div>
            <span className="text-caption font-medium text-foreground">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        <Button onClick={handleNativeShare} className="w-full gradient-primary text-white rounded-btn h-12 font-semibold gap-2">
          <Share2 className="w-4 h-4" /> Share Now
        </Button>
      </SheetContent>
    </Sheet>
  );
}
