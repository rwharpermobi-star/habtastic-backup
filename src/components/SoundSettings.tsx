import { useEffect, useState } from "react";
import { Volume2, VolumeX, Smartphone, Play } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  isSfxEnabled, setSfxEnabled,
  getSfxVolume, setSfxVolume, refreshVolume,
  isHapticsEnabled, setHapticsEnabled,
  playPreview,
} from "@/lib/sfx";

/**
 * Drop-in card for /appearance or /settings. Controls the unified sound
 * system: master enable, volume, haptics, and per-event preview.
 */
export default function SoundSettings() {
  const [sfxOn, setSfxOn]   = useState<boolean>(true);
  const [hapOn, setHapOn]   = useState<boolean>(true);
  const [vol, setVol]       = useState<number>(0.7);

  useEffect(() => {
    setSfxOn(isSfxEnabled());
    setHapOn(isHapticsEnabled());
    setVol(getSfxVolume());
  }, []);

  const onToggleSfx = (v: boolean) => {
    setSfxOn(v);
    setSfxEnabled(v);
    if (v) playPreview("success");
  };
  const onToggleHap = (v: boolean) => {
    setHapOn(v);
    setHapticsEnabled(v);
    if (v && navigator.vibrate) navigator.vibrate(20);
  };
  const onVolume = (n: number) => {
    setVol(n);
    setSfxVolume(n);
    refreshVolume();
  };

  return (
    <div className="glass p-5 space-y-6">
      <div>
        <h3 className="text-h3 mb-1">Sound &amp; Haptics</h3>
        <p className="text-meta">
          The HabTastic AI sound identity. All effects are short, tuneful, and
          respect your device's silent mode.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="icon-tile icon-tile-sm">
            {sfxOn ? <Volume2 className="icon-sm" /> : <VolumeX className="icon-sm" />}
          </span>
          <div>
            <div className="text-sm font-semibold">Sound effects</div>
            <div className="text-meta">Chimes, sparkles &amp; celebrations</div>
          </div>
        </div>
        <Switch checked={sfxOn} onCheckedChange={onToggleSfx} />
      </div>

      <div className={sfxOn ? "" : "opacity-50 pointer-events-none"}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-label">Volume</span>
          <span className="text-caption stat-num text-primary">{Math.round(vol * 100)}%</span>
        </div>
        <Slider
          value={[vol]}
          min={0}
          max={1}
          step={0.05}
          onValueChange={(v) => onVolume(v[0])}
          onValueCommit={() => playPreview("notification")}
          aria-label="Sound effect volume"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="icon-tile icon-tile-sm icon-tile-accent">
            <Smartphone className="icon-sm" />
          </span>
          <div>
            <div className="text-sm font-semibold">Haptic feedback</div>
            <div className="text-meta">Subtle vibrations on supported devices</div>
          </div>
        </div>
        <Switch checked={hapOn} onCheckedChange={onToggleHap} />
      </div>

      {sfxOn && (
        <div>
          <div className="text-label mb-2">Preview signature sounds</div>
          <div className="grid grid-cols-2 gap-2">
            {PREVIEWS.map((p) => (
              <Button
                key={p.kind}
                variant="secondary"
                size="sm"
                onClick={() => playPreview(p.kind as any)}
                className="justify-start"
              >
                <Play className="icon-xs" />
                <span className="truncate">{p.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PREVIEWS = [
  { kind: "habit",            label: "Habit complete" },
  { kind: "xp",               label: "XP earned" },
  { kind: "levelUp",          label: "Level up" },
  { kind: "achievement",      label: "Achievement" },
  { kind: "streak",           label: "Streak" },
  { kind: "streakBig",        label: "Big streak" },
  { kind: "chest",            label: "Chest open" },
  { kind: "challenge",        label: "Challenge win" },
  { kind: "premium",          label: "Premium" },
  { kind: "winston",          label: "Winston ping" },
  { kind: "winstonChallenge", label: "Winston challenge" },
];
