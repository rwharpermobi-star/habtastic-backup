import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Check, Sparkles, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
import { usePremium } from '@/hooks/usePremium';
import ThemePreviewCard from '@/components/ThemePreviewCard';

import { isSfxEnabled, setSfxEnabled } from '@/lib/sfx';

const ACCENT_COLORS = [
  { id: 'blue', label: 'Ocean Blue', color: '#0077FF', emoji: '🔵' },
  { id: 'orange', label: 'Electric Orange', color: '#FF6A00', emoji: '🟠' },
  { id: 'purple', label: 'Royal Purple', color: '#7B2FF7', emoji: '🟣' },
  { id: 'pink', label: 'Hot Pink', color: '#FF2D87', emoji: '💗' },
];

const UI_INTENSITY = [
  { id: 'normal', label: 'Normal', desc: 'Standard contrast' },
  { id: 'high', label: 'High Contrast', desc: 'Enhanced readability' },
];


export default function AppearanceSettings() {
  const navigate = useNavigate();
  const { theme, setTheme, glowEnabled, setGlowEnabled } = useTheme();
  const { isPremium } = usePremium();
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('habtastic-accent') || 'blue');
  const [uiIntensity, setUiIntensity] = useState(() => localStorage.getItem('habtastic-ui-intensity') || 'normal');
  const [sfxOn, setSfxOn] = useState(isSfxEnabled);
  const [hapticOn, setHapticOn] = useState(true);
  const [clockFormat, setClockFormat] = useState<'12' | '24'>(() =>
    (localStorage.getItem('habtastic-clock-format') === '12' ? '12' : '24')
  );

  const handleClockFormatToggle = (use24: boolean) => {
    const next: '12' | '24' = use24 ? '24' : '12';
    setClockFormat(next);
    localStorage.setItem('habtastic-clock-format', next);
    window.dispatchEvent(new Event('habtastic:clock-format-changed'));
    toast.success(`Clock set to ${next}-hour format`);
  };

  const handleThemeSelect = (t: 'light' | 'dark') => {
    if (t === theme) return;
    setTheme(t);
    toast.success(t === 'dark' ? 'Midnight Navy enabled' : 'Arctic Mint enabled');
  };

  const handleGlowToggle = (v: boolean) => {
    if (v && !isPremium) {
      toast.error('Glow is a Premium theme — unlock to enable ✨');
      navigate('/pricing');
      return;
    }
    setGlowEnabled(v);
    toast.success(v ? 'Glow theme enabled ✨' : 'Glow theme disabled');
  };

  const handleAccentChange = (id: string) => {
    setAccentColor(id);
    localStorage.setItem('habtastic-accent', id);
    // Apply accent color to CSS vars
    const colorMap: Record<string, string> = {
      blue: '212 100% 50%',
      green: '81 100% 50%',
      orange: '25 100% 50%',
      purple: '265 93% 58%',
      pink: '338 100% 58%',
    };
    document.documentElement.style.setProperty('--primary', colorMap[id]);
    toast.success(`Accent color changed to ${ACCENT_COLORS.find(c => c.id === id)?.label}`);
  };

  const handleIntensityChange = (id: string) => {
    setUiIntensity(id);
    localStorage.setItem('habtastic-ui-intensity', id);
    if (id === 'high') {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    toast.success(`UI set to ${id === 'high' ? 'High Contrast' : 'Normal'}`);
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
      <h1 className="text-h1 text-foreground mb-6">Appearance</h1>

      {/* Theme picker */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Theme</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <ThemePreviewCard
          variant="light"
          selected={theme === 'light'}
          onSelect={() => handleThemeSelect('light')}
        />
        <ThemePreviewCard
          variant="dark"
          selected={theme === 'dark'}
          onSelect={() => handleThemeSelect('dark')}
        />
      </div>

      {/* Premium Glow variant */}
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        <div className="flex items-center gap-3 p-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <Sparkles className="w-[18px] h-[18px] text-primary-foreground" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-body font-medium text-foreground">Glow Theme</p>
              {!isPremium && (
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-primary to-accent text-primary-foreground">
                  <Lock className="w-2.5 h-2.5" /> Pro
                </span>
              )}
            </div>
            <p className="text-caption text-muted-foreground">Animated mesh background + amplified mint glow</p>
          </div>
          <Switch checked={glowEnabled} onCheckedChange={handleGlowToggle} />
        </div>
      </div>

      {/* Accent Color */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Accent Color</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {ACCENT_COLORS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => handleAccentChange(c.id)}
            className={`w-full flex items-center gap-3 p-4 transition-all text-left ${i < ACCENT_COLORS.length - 1 ? 'border-b border-border/40' : ''} ${accentColor === c.id ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.color + '20' }}>
              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: c.color }} />
            </div>
            <div className="flex-1">
              <p className="text-body font-medium text-foreground">{c.label}</p>
            </div>
            {accentColor === c.id && (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* UI Intensity */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">UI Intensity</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {UI_INTENSITY.map((mode, i) => (
          <button
            key={mode.id}
            onClick={() => handleIntensityChange(mode.id)}
            className={`w-full flex items-center gap-3 p-4 transition-all text-left ${i < UI_INTENSITY.length - 1 ? 'border-b border-border/40' : ''} ${uiIntensity === mode.id ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
          >
            <div className="flex-1">
              <p className="text-body font-medium text-foreground">{mode.label}</p>
              <p className="text-caption text-muted-foreground">{mode.desc}</p>
            </div>
            {uiIntensity === mode.id && (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Clock format */}
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Clock Format</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {/* Live preview — both formats side by side, active highlighted */}
        <ClockFormatPreview format={clockFormat} onSelect={handleClockFormatToggle} />
        <div className="flex items-center gap-3 p-4 border-t border-border/40">
          <div className="flex-1">
            <p className="text-body font-medium text-foreground">24-hour clock</p>
            <p className="text-caption text-muted-foreground">
              Header clock updates instantly.
            </p>
          </div>
          <Switch checked={clockFormat === '24'} onCheckedChange={handleClockFormatToggle} />
        </div>
      </div>
    </motion.div>
  );
}

function ClockFormatPreview({
  format,
  onSelect,
}: {
  format: '12' | '24';
  onSelect: (use24: boolean) => void;
}) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const align = 1000 - (Date.now() % 1000);
    let interval: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 1000);
    }, align);
    return () => { clearTimeout(t); if (interval) clearInterval(interval); };
  }, []);

  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const t24 = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const t12 = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: true }).format(now);

  const Card = ({ label, time, active, onClick }: { label: string; time: string; active: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 p-4 flex flex-col items-center gap-1 transition-all ${
        active
          ? 'bg-primary/10 ring-2 ring-primary/40'
          : 'bg-secondary/40 hover:bg-secondary/70'
      }`}
    >
      <span className={`font-display font-bold text-2xl tabular-nums ${active ? 'text-glow-primary' : 'text-foreground'}`}>
        {time}
      </span>
      <span className={`text-[11px] uppercase tracking-wider font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </button>
  );

  return (
    <div className="flex gap-px bg-border">
      <Card label="24-hour" time={t24} active={format === '24'} onClick={() => onSelect(true)} />
      <Card label="12-hour" time={t12} active={format === '12'} onClick={() => onSelect(false)} />
    </div>
  );
}
