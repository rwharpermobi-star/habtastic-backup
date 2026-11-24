import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';

export type BgTrack = 'lofi' | 'rain' | 'ambient';

// Audio files served from /public so they aren't bundled into the JS payload.
// They only download when the user actually starts playback.
// All tracks ship as Opus (small, gapless loops) with an AAC/M4A fallback for
// engines without Opus support (older iOS Safari).
export const TRACK_SOURCES: Record<BgTrack, string[]> = {
  lofi: ['/sounds/lofi.ogg', '/sounds/lofi.m4a'],
  rain: ['/sounds/rain.ogg', '/sounds/rain.m4a'],
  ambient: ['/sounds/ambient.ogg', '/sounds/ambient.m4a'],
};

export const MIME_BY_EXT: Record<string, string> = {
  ogg: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
};

// Pick the first source the current engine can actually decode.
export const resolveTrackUrl = (t: BgTrack): string => {
  const sources = TRACK_SOURCES[t];
  try {
    const probe = document.createElement('audio');
    for (const src of sources) {
      const ext = src.split('.').pop() ?? '';
      const mime = MIME_BY_EXT[ext];
      if (mime && probe.canPlayType(mime)) return src;
    }
  } catch { /* ignore: best effort */ }
  return sources[sources.length - 1];
};


const TRACK_LABELS: Record<BgTrack, string> = {
  lofi: 'Lofi',
  rain: 'Rain',
  ambient: 'Ambient',
};

const STORAGE_KEY = 'habtastic-bg-music';

interface BgMusicState {
  track: BgTrack;
  volume: number;
  isPlaying: boolean;
}

interface BackgroundMusicContextValue {
  track: BgTrack;
  volume: number;
  isPlaying: boolean;
  setTrack: (t: BgTrack) => void;
  setVolume: (v: number) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  tracks: { id: BgTrack; label: string }[];
}

const BackgroundMusicContext = createContext<BackgroundMusicContextValue | null>(null);

const loadState = (): BgMusicState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BgMusicState>;
      return {
        track: (parsed.track as BgTrack) || 'lofi',
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.3,
        isPlaying: parsed.isPlaying ?? false,
      };
    }
  } catch { /* ignore: best effort */ }
  return { track: 'lofi', volume: 0.3, isPlaying: false };
};

export function BackgroundMusicProvider({ children }: { children: ReactNode }) {
  const initial = loadState();
  const [track, setTrackState] = useState<BgTrack>(initial.track);
  const [volume, setVolumeState] = useState<number>(initial.volume);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Lazily create the audio element on first play — avoids ~16 MB of MP3
  // prefetch and audio element overhead on every cold start for users who
  // never toggle music on.
  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio(resolveTrackUrl(track));
    audio.loop = true;
    audio.volume = volume;
    audio.preload = 'none';
    audioRef.current = audio;
    return audio;
  }, [track, volume]);

  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ track, volume, isPlaying })
      );
    } catch { /* ignore: best effort */ }
  }, [track, volume, isPlaying]);

  // Apply volume in real time (skip if a fade ramp is in progress)
  const fadingRef = useRef(false);
  const duckedRef = useRef(false);
  useEffect(() => {
    if (audioRef.current && !fadingRef.current && !duckedRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  // Listen for global "duck" events (e.g. Winston voice)
  useEffect(() => {
    const onDuck = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      duckedRef.current = true;
      // quick fade to silence
      const start = audio.volume;
      const startTime = performance.now();
      const dur = 200;
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / dur);
        audio.volume = Math.max(0, Math.min(1, start * (1 - t)));
        if (t < 1) requestAnimationFrame(step);
        else audio.pause();
      };
      requestAnimationFrame(step);
    };
    const onUnduck = () => {
      const audio = audioRef.current;
      if (!audio || !duckedRef.current) return;
      duckedRef.current = false;
      if (!isPlaying) return;
      audio.volume = 0;
      audio.play().then(() => {
        const startTime = performance.now();
        const dur = 400;
        const step = (now: number) => {
          if (duckedRef.current) return; // ducked again mid-fade
          const t = Math.min(1, (now - startTime) / dur);
          if (audioRef.current) audioRef.current.volume = Math.max(0, Math.min(1, volume * t));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }).catch(() => {});
    };
    window.addEventListener('bg-music:duck', onDuck);
    window.addEventListener('bg-music:unduck', onUnduck);
    return () => {
      window.removeEventListener('bg-music:duck', onDuck);
      window.removeEventListener('bg-music:unduck', onUnduck);
    };
  }, [volume, isPlaying]);

  const clampVol = (v: number) => Math.max(0, Math.min(1, v));

  const fadeTo = useCallback((target: number, duration = 400): Promise<void> => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) return resolve();
      fadingRef.current = true;
      const start = audio.volume;
      const safeTarget = clampVol(target);
      const startTime = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        audio.volume = clampVol(start + (safeTarget - start) * t);
        if (t < 1) requestAnimationFrame(step);
        else {
          fadingRef.current = false;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }, []);

  const play = useCallback(async () => {
    const audio = ensureAudio();
    try {
      audio.volume = 0;
      await audio.play();
      setIsPlaying(true);
      await fadeTo(volume, 400);
    } catch {
      setIsPlaying(false);
    }
  }, [volume, fadeTo, ensureAudio]);

  const pause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    await fadeTo(0, 300);
    audio.pause();
    audio.volume = volume;
    setIsPlaying(false);
  }, [volume, fadeTo]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const setTrack = useCallback(async (t: BgTrack) => {
    setTrackState(t);
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = !audio.paused || isPlaying;
    if (wasPlaying) {
      await fadeTo(0, 300);
      audio.pause();
    }
    audio.src = resolveTrackUrl(t);
    audio.loop = true;
    if (wasPlaying) {
      try {
        audio.volume = 0;
        await audio.play();
        setIsPlaying(true);
        await fadeTo(volume, 400);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.volume = volume;
    }
  }, [volume, isPlaying, fadeTo]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
  }, []);

  // Auto-resume on first user interaction if previously playing.
  // We don't try to play() on mount — that would force audio element creation
  // and a 7-8 MB network fetch on every cold start.
  useEffect(() => {
    if (!initial.isPlaying) return;
    const tryPlay = () => {
      play();
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
    };
    window.addEventListener('pointerdown', tryPlay, { once: true });
    window.addEventListener('keydown', tryPlay, { once: true });
    return () => {
      window.removeEventListener('pointerdown', tryPlay);
      window.removeEventListener('keydown', tryPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BackgroundMusicContext.Provider
      value={{
        track,
        volume,
        isPlaying,
        setTrack,
        setVolume,
        togglePlay,
        play,
        pause,
        tracks: (Object.keys(TRACK_SOURCES) as BgTrack[]).map((id) => ({ id, label: TRACK_LABELS[id] })),
      }}
    >
      {children}
    </BackgroundMusicContext.Provider>
  );
}

export function useBackgroundMusic() {
  const ctx = useContext(BackgroundMusicContext);
  if (!ctx) throw new Error('useBackgroundMusic must be used within BackgroundMusicProvider');
  return ctx;
}
