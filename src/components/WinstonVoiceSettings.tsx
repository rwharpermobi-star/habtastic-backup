import { useState, useCallback, useRef } from 'react';
import { Mic, Play, Square } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { WINSTON_VOICES } from '@/hooks/useWinstonVoice';
import { toast } from 'sonner';

export default function WinstonVoiceSettings() {
  const [voiceId, setVoiceId] = useState(() => {
    const savedVoiceId = localStorage.getItem('winston-voice-id');
    const id = !savedVoiceId || savedVoiceId === 'bIHbv24MWmeRgasZH58o' ? 'pNInz6obpgDQGcFmaJgB' : savedVoiceId;
    if (id !== savedVoiceId) localStorage.setItem('winston-voice-id', id);
    return id;
  });
  const [speed, setSpeed] = useState(() => parseFloat(localStorage.getItem('winston-speed') || '0.95'));
  const [expressiveness, setExpressivenessState] = useState(() => parseFloat(localStorage.getItem('winston-expressiveness') || '0.60'));
  const [warmth, setWarmthState] = useState(() => parseFloat(localStorage.getItem('winston-warmth') || '0.45'));
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoiceChange = (id: string) => {
    setVoiceId(id);
    localStorage.setItem('winston-voice-id', id);
    const name = WINSTON_VOICES.find(v => v.id === id)?.name;
    toast.success(`Winston's voice set to ${name}`);
  };

  const handleSpeedChange = ([v]: number[]) => {
    const s = v / 100;
    setSpeed(s);
    localStorage.setItem('winston-speed', String(s));
  };

  const handleExpressivenessChange = ([v]: number[]) => {
    const val = v / 100;
    setExpressivenessState(val);
    localStorage.setItem('winston-expressiveness', String(val));
  };

  const handleWarmthChange = ([v]: number[]) => {
    const val = v / 100;
    setWarmthState(val);
    localStorage.setItem('winston-warmth', String(val));
  };

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  const previewVoice = useCallback(async (vid: string) => {
    if (previewingId === vid) {
      stopPreview();
      return;
    }
    stopPreview();
    setPreviewingId(vid);

    try {
      const { edgeFunctionFetch } = await import('@/lib/edgeFunctionFetch');
      const res = await edgeFunctionFetch('elevenlabs-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Hello! I'm Winston, your HabTastic Coach. How is your day going today?",
          voiceId: vid,
          speed,
          style: expressiveness,
          stability: warmth,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') || !res.ok) {
        throw new Error('Preview failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => { setPreviewingId(null); previewAudioRef.current = null; };
      audio.onerror = () => { setPreviewingId(null); previewAudioRef.current = null; };
      await audio.play();
    } catch {
      setPreviewingId(null);
      toast.error('Voice preview unavailable');
    }
  }, [previewingId, stopPreview, speed, expressiveness, warmth]);

  return (
    <>
      <h3 className="font-semibold text-body-lg text-foreground mb-3">Winston Voice</h3>
      <div className="glass rounded-card overflow-hidden shadow-card mb-6">
        {(() => {
          const v = WINSTON_VOICES[0];
          if (!v) return null;
          return (
            <div className="flex items-center gap-3 p-4 bg-primary/5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Mic className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body font-medium text-foreground">{v.name}</p>
                <p className="text-caption text-muted-foreground">{v.desc}</p>
              </div>
              <button
                onClick={() => previewVoice(v.id)}
                className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors"
                title={`Preview ${v.name}`}
              >
                {previewingId === v.id ? (
                  <Square className="w-3.5 h-3.5 text-primary fill-primary" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-primary fill-primary" />
                )}
              </button>
            </div>
          );
        })()}
        {/* Speech Speed */}
        <div className="p-4 border-t border-border/40 space-y-2">
          <div className="flex justify-between">
            <p className="text-body font-medium text-foreground">Speech Speed</p>
            <span className="text-caption text-muted-foreground">{speed.toFixed(2)}×</span>
          </div>
          <Slider
            value={[speed * 100]}
            min={70}
            max={120}
            step={5}
            onValueChange={handleSpeedChange}
            className="w-full"
          />
          <div className="flex justify-between text-caption text-muted-foreground">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>
        {/* Expressiveness (Style) */}
        <div className="p-4 border-t border-border/40 space-y-2">
          <div className="flex justify-between">
            <p className="text-body font-medium text-foreground">Expressiveness</p>
            <span className="text-caption text-muted-foreground">{Math.round(expressiveness * 100)}%</span>
          </div>
          <Slider
            value={[expressiveness * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={handleExpressivenessChange}
            className="w-full"
          />
          <div className="flex justify-between text-caption text-muted-foreground">
            <span>Calm</span>
            <span>Energetic</span>
          </div>
        </div>
        {/* Warmth (Stability — inverted label) */}
        <div className="p-4 border-t border-border/40 space-y-2">
          <div className="flex justify-between">
            <p className="text-body font-medium text-foreground">Voice Warmth</p>
            <span className="text-caption text-muted-foreground">{Math.round((1 - warmth) * 100)}%</span>
          </div>
          <Slider
            value={[(1 - warmth) * 100]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]: number[]) => handleWarmthChange([100 - v])}
            className="w-full"
          />
          <div className="flex justify-between text-caption text-muted-foreground">
            <span>Consistent</span>
            <span>Natural</span>
          </div>
        </div>
      </div>
    </>
  );
}
