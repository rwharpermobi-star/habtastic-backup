import { Play, Pause, Music2, Volume2 } from 'lucide-react';
import { useBackgroundMusic, type BgTrack } from '@/contexts/BackgroundMusicContext';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function EqualizerBars() {
  return (
    <div className="flex items-end gap-[2px] h-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-current eq-bar"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <style>{`
        @keyframes eq-pulse {
          0%, 100% { height: 30%; opacity: 0.7; }
          50% { height: 100%; opacity: 1; }
        }
        .eq-bar {
          height: 30%;
          animation: eq-pulse 0.9s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export default function BackgroundMusicControl({ className }: { className?: string }) {
  const { track, volume, isPlaying, setTrack, setVolume, togglePlay, tracks } = useBackgroundMusic();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Background music"
          className={cn(
            'inline-flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-colors',
            isPlaying && 'text-primary border-primary/40 bg-primary/5',
            className
          )}
        >
          {isPlaying ? <EqualizerBars /> : <Music2 className="w-4 h-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Background Music</p>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause music' : 'Play music'}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => setTrack(t.id as BgTrack)}
              className={cn(
                'rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                track === t.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-accent'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Volume {Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={(v) => setVolume(v[0] ?? 0)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
