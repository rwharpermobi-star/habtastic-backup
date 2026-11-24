import { useState, useRef, useCallback, useEffect } from 'react';
import { edgeFunctionFetch } from '@/lib/edgeFunctionFetch';

interface UseVoiceOptions {
  onTranscript?: (text: string) => void;
  coachGender?: 'male' | 'female' | null;
  autoPlayResponses?: boolean;
}

const PREMIUM_VOICE_ENABLED_KEY = 'habit-hero-premium-voice-enabled';
const PREMIUM_VOICE_UNAVAILABLE_KEY = 'habit-hero-premium-voice-unavailable';
const PLAYBACK_SPEED_KEY = 'habit-hero-playback-speed';

// Audio cache for instant replay of previously generated speech
const audioCache = new Map<string, string>();

const getStoredPremiumVoiceEnabled = () => {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(PREMIUM_VOICE_ENABLED_KEY);
  const unavailable = window.localStorage.getItem(PREMIUM_VOICE_UNAVAILABLE_KEY) === 'true';

  if (unavailable) return false;
  return stored !== 'false';
};

export function useVoice({ onTranscript, coachGender, autoPlayResponses = false }: UseVoiceOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoPlay, setAutoPlay] = useState(autoPlayResponses);
  const [micError, setMicError] = useState<string | null>(null);
  const [usePremiumVoice, setUsePremiumVoiceState] = useState(getStoredPremiumVoiceEnabled);
  const [playbackSpeed, setPlaybackSpeedState] = useState(() => {
    if (typeof window === 'undefined') return 1.0;
    const stored = parseFloat(window.localStorage.getItem(PLAYBACK_SPEED_KEY) || '');
    return [0.5, 0.75, 1, 1.25, 1.5, 2].includes(stored) ? stored : 1.0;
  });
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const supportsSTT = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const supportsTTS = true; // Always true since we have ElevenLabs backend

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PLAYBACK_SPEED_KEY, String(speed));
    }
  }, []);

  const setUsePremiumVoice = useCallback((enabled: boolean) => {
    setUsePremiumVoiceState(enabled);

    if (typeof window === 'undefined') return;

    window.localStorage.setItem(PREMIUM_VOICE_ENABLED_KEY, String(enabled));
    if (enabled) {
      window.localStorage.removeItem(PREMIUM_VOICE_UNAVAILABLE_KEY);
    }
  }, []);

  const disablePremiumVoice = useCallback(() => {
    setUsePremiumVoiceState(false);

    if (typeof window === 'undefined') return;

    window.localStorage.setItem(PREMIUM_VOICE_ENABLED_KEY, 'false');
    window.localStorage.setItem(PREMIUM_VOICE_UNAVAILABLE_KEY, 'true');
  }, []);

  const startListening = useCallback(() => {
    if (!supportsSTT) {
      setMicError('Voice input not supported in this browser');
      return;
    }
    setMicError(null);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setTranscript(finalText || interimText);
      if (finalText) {
        onTranscript?.(finalText);
      }
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === 'not-allowed') setMicError('Microphone access denied. Please allow mic access.');
      else if (event.error === 'no-speech') setMicError("We didn't catch that, try again");
      else setMicError('Voice error: ' + event.error);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [supportsSTT, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Browser fallback TTS with improved voice selection and natural settings
  const speakBrowser = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();

    // Humanise the text: add micro-pauses at punctuation for more natural cadence
    const humanText = text
      .replace(/\.\s/g, '… ')
      .replace(/!\s/g, '!… ')
      .replace(/\?\s/g, '?… ');

    const utterance = new SpeechSynthesisUtterance(humanText);
    const voices = speechSynthesis.getVoices();
    const isMale = coachGender === 'male';

    // Ranked keyword lists – ordered by quality / naturalness
    const maleKeywords = [
      'google uk english male', 'microsoft guy', 'microsoft mark',
      'james', 'david', 'microsoft david', 'english male',
    ];
    const femaleKeywords = [
      'google uk english female', 'samantha', 'microsoft zira', 'karen',
      'victoria', 'google us english', 'english female',
    ];
    const keywords = isMale ? maleKeywords : femaleKeywords;

    const lower = voices.map(v => ({ v, n: v.name.toLowerCase(), l: v.lang.toLowerCase() }));

    // Try ranked keywords first
    for (const kw of keywords) {
      const match = lower.find(x => x.n.includes(kw) && x.l.startsWith('en'));
      if (match) { utterance.voice = match.v; break; }
    }

    // Fallback: prefer a native English voice that is the right gender-ish name
    if (!utterance.voice) {
      const engVoices = lower.filter(x => x.l.startsWith('en'));
      // Try to pick one whose name hints at the desired gender
      const genderHint = isMale
        ? engVoices.find(x => /\b(male|guy|man|david|james|mark)\b/.test(x.n))
        : engVoices.find(x => /\b(female|woman|samantha|karen|zira|victoria|sarah|alice)\b/.test(x.n));
      if (genderHint) utterance.voice = genderHint.v;
      else if (engVoices.length) utterance.voice = engVoices[0].v;
    }

    // Natural-sounding settings per coach
    utterance.rate = isMale ? 0.92 : 0.96;
    utterance.pitch = isMale ? 0.85 : 1.05;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(utterance);
  }, [coachGender]);

  // ElevenLabs premium TTS
  const speakPremium = useCallback(async (text: string) => {
    try {
      const coachName = coachGender === 'male' ? 'winston' : 'maya';
      const cacheKey = `${coachName}:${text}`;
      setLastSpokenText(text);

      // Check cache first for instant replay
      const cached = audioCache.get(cacheKey);
      if (cached) {
        abortRef.current?.abort();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        setIsSpeaking(true);
        const audio = new Audio(cached);
        audio.playbackRate = playbackSpeed;
        audioRef.current = audio;
        audio.onended = () => { setIsSpeaking(false); audioRef.current = null; };
        audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; };
        await audio.play();
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGeneratingVoice(true);
      setIsSpeaking(true);

      // Bypasses CapacitorHttp on Android so the MP3 is not decoded as text.
      const response = await edgeFunctionFetch('elevenlabs-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, coach: coachName }),
        signal: controller.signal,
      });

      setIsGeneratingVoice(false);

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);

        if (payload?.fallback_to_browser) {
          // Premium voice unavailable — stay silent rather than playing the
          // robotic browser TTS. User asked for one natural voice only.
          disablePremiumVoice();
          setIsSpeaking(false);
          return;
        }
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          disablePremiumVoice();
        }
        throw new Error(`TTS failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Cache for instant replay
      audioCache.set(cacheKey, audioUrl);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audio.playbackRate = playbackSpeed;
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };

      await audio.play();
    } catch (e) {
      setIsGeneratingVoice(false);
      if (e.name !== 'AbortError') {
        setIsSpeaking(false);
        // No robotic browser-TTS fallback — we only use the human ElevenLabs voice.
      }
    }
  }, [coachGender, playbackSpeed, disablePremiumVoice]);

  const speak = useCallback((text: string, _forcePremium?: boolean) => {
    if (!voiceEnabled) return;
    // Always use the premium ElevenLabs voice. The robotic browser TTS path
    // is intentionally disabled to guarantee one natural voice.
    speakPremium(text);
  }, [voiceEnabled, speakPremium]);

  const stopSpeaking = useCallback(() => {
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsGeneratingVoice(false);
  }, []);

  const replay = useCallback(() => {
    if (lastSpokenText) {
      speak(lastSpokenText);
    }
  }, [lastSpokenText, speak]);

  // Preload browser voices as fallback
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
  }, []);

  // Sync playback speed to active audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  return {
    isListening,
    isSpeaking,
    isGeneratingVoice,
    lastSpokenText,
    transcript,
    micError,
    voiceEnabled,
    autoPlay,
    usePremiumVoice,
    playbackSpeed,
    supportsSTT,
    supportsTTS,
    setVoiceEnabled,
    setAutoPlay,
    setUsePremiumVoice,
    setPlaybackSpeed,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    replay,
    setTranscript,
  };
}
