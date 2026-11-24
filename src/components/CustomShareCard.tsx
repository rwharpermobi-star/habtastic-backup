import { PRODUCTION_WEB_ORIGIN } from '@/lib/appOrigin';
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Check, Share2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export type CustomShareKind = 'streak' | 'consistency';

interface Props {
  kind: CustomShareKind;
  /** main number to highlight (e.g. 12 days, 87%) */
  value: number;
  /** suffix shown after the number in the preview (e.g. 'days', '%') */
  unit?: string;
  /** Display name to personalize the message */
  userName?: string;
  children: React.ReactNode;
}

const PRESETS: Record<CustomShareKind, (n: number, name: string) => string[]> = {
  streak: (n, name) => [
    `🔥 ${n}-day streak! No days off.`,
    `${name} is locked in — ${n} days strong 💪`,
    `Streak count: ${n}. I'm not stopping.`,
    `Day ${n} of building habits that stick 🚀`,
  ],
  consistency: (n, name) => [
    `My consistency this week: ${n}% 📈`,
    `${name} is operating at ${n}% — sharp focus.`,
    `${n}% consistent. Small wins compound 🧠`,
    `Showing up ${n}% of the time. That's the game.`,
  ],
};

const APP_TAG = `\n\nTracked with HabTastic ⚡ ${PRODUCTION_WEB_ORIGIN}`;

export default function CustomShareCard({ kind, value, unit, userName = 'I', children }: Props) {
  const [open, setOpen] = useState(false);
  const presets = useMemo(() => PRESETS[kind](value, userName), [kind, value, userName]);
  const [text, setText] = useState(presets[0]);
  const [activePreset, setActivePreset] = useState(0);

  const fullText = text + APP_TAG;
  const displayValue = unit ? `${value}${unit === '%' ? '%' : ` ${unit}`}` : `${value}`;

  const choosePreset = (i: number) => {
    setActivePreset(i);
    setText(presets[i]);
  };

  const onCopy = () => {
    navigator.clipboard.writeText(fullText);
    toast.success('Copied — paste anywhere 📋');
  };

  const onNative = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: fullText }); setOpen(false); }
      catch { /* user cancelled */ }
    } else {
      onCopy();
    }
  };

  const onWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
    setOpen(false);
  };

  const gradient = kind === 'streak'
    ? 'linear-gradient(135deg, hsl(20, 90%, 55%), hsl(0, 80%, 60%))'
    : 'linear-gradient(135deg, hsl(210, 85%, 60%), hsl(280, 75%, 65%))';

  const emoji = kind === 'streak' ? '🔥' : '📊';
  const label = kind === 'streak' ? 'STREAK' : 'CONSISTENCY';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <span className="inline-flex">{children}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-[1.5rem] pb-8 max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Share {kind === 'streak' ? 'streak' : 'score'}</SheetTitle>
        </SheetHeader>

        {/* Visual preview */}
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl p-5 text-white shadow-2xl relative overflow-hidden"
            style={{ background: gradient }}
          >
            <div className="absolute inset-0 opacity-20" style={{
              background: 'radial-gradient(circle at 80% 20%, white, transparent 50%)'
            }} />
            <div className="relative">
              <p className="text-[11px] uppercase tracking-widest opacity-90">{label}</p>
              <p className="text-5xl font-extrabold mt-1 leading-none">
                {displayValue} <span className="text-3xl">{emoji}</span>
              </p>
              <p className="text-sm mt-3 opacity-95 leading-snug whitespace-pre-line">{text}</p>
              <p className="text-[10px] mt-4 opacity-70">HabTastic ⚡</p>
            </div>
          </motion.div>
        </div>

        {/* Preset chips */}
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Quick text</p>
          <div className="flex gap-1.5 flex-wrap">
            {presets.map((p, i) => (
              <button
                key={i}
                onClick={() => choosePreset(i)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  activePreset === i
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                Style {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Editable text */}
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Customize</p>
          <Textarea
            value={text}
            onChange={e => { setText(e.target.value); setActivePreset(-1); }}
            rows={3}
            maxLength={240}
            className="bg-secondary border-border resize-none"
          />
          <p className="text-[10px] text-muted-foreground mt-1 text-right">{text.length}/240</p>
        </div>

        {/* Share actions */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={onNative} className="gradient-primary text-primary-foreground rounded-btn h-11">
            <Share2 className="w-4 h-4 mr-1.5" /> Share
          </Button>
          <Button onClick={onCopy} variant="outline" className="rounded-btn h-11">
            <Copy className="w-4 h-4 mr-1.5" /> Copy
          </Button>
          <Button onClick={onWhatsApp} variant="outline" className="rounded-btn h-11 col-span-2">
            <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
